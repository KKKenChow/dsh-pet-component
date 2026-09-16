import type {
  PetMutteringEvent,
  PetMutteringHandle,
  PetMutteringHandler,
  PetMutteringReason,
  PetMutteringShowOptions,
} from '../types'
import { useIntervalFn, useUnmount } from '@reause/core'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { pick, pickMeme } from '../config'

/**
 * 碎碎念（muttering）—— **触发逻辑逐条对齐 dsh-pet**，生成留给宿主。
 *
 * 与 dsh-pet 的分工完全同构：
 *
 * | 角色 | dsh-pet | 本组件 |
 * | --- | --- | --- |
 * | 周期与门控 | `client/pet.ts` 的 `whisperEnabled` + `eventsRefreshSec.whisper` 轮询 | 本文件的控制器 |
 * | 生成一句话 | `host/whisper.ts` 的 `generateWhisper(ctx, whisperPrompt, meme)` | 宿主的 `onMuttering` 回调 |
 * | 抽动画 + 弹气泡 | `client/pet.ts` 的 `triggerWhisper(text, image)` | `pet.muttering(text, { image })` |
 *
 * 触发语义（对齐点）：
 * 1. **首拍只记基线**：挂载后第一次到点以 `reason: 'baseline'` 通知宿主，且此期间宿主推回的
 *    文本会被丢弃（对应 dsh-pet 的 `hasBaseline`：首拉只记 `ts`，避免启动/刷新时重放）；
 *    `mutteringImmediate` 可关掉这个行为；
 * 2. **整池随机抽 1 段**：`animations.events.whisper` 摊平后等概率抽，避开当前正播的那段；
 * 3. **气泡 10s**：展示时长与动画解耦（动画被打断，气泡照样按时收起）；
 * 4. **失败静默**：宿主回调抛错只 `console.warn`，不打断周期、不弹错误气泡。
 *
 * 状态机（`createMutteringController`）是纯逻辑、可单测；hook 只负责把「周期」接上。
 */

/** 渲染层端口：拿动画名与弹气泡（由 `Pet` 按渲染器实现）。 */
export interface MutteringPorts {
  /** 该要一句了（宿主生成完调 `pet.muttering(text)` 推回） */
  onMuttering?: PetMutteringHandler
  /** 播一次碎碎念动画；`undefined` = `events.whisper` 池为空，调用方回落（Codex 用 `waving`） */
  onPlay: (name?: string) => void
  /** 弹气泡（`duration` 已解析成 ms） */
  onShow: (text: string, options: { image?: string, duration: number }) => void
}

/** 创建碎碎念控制器所需的一切（都是已收敛的值，不再做回落）。 */
export interface MutteringControllerOptions extends MutteringPorts {
  /** 是否启用自动碎碎念（周期到点才通知宿主；`pet.muttering(text)` 不受它门控） */
  enabled: boolean
  prompt: string
  /** 周期（秒） */
  intervalSec: number
  /** 首拍是否即索取（`false` = 对齐 dsh-pet「首拍只记基线」） */
  immediate: boolean
  petId?: string
  /** 气泡默认展示时长 ms */
  duration: number
  /** 是否抽配图 */
  image: boolean
  /** 配图池（`config.memes`） */
  memes?: Record<string, string>
  /** 碎碎念动画池（`animations.events.whisper` 摊平） */
  whisperPool?: readonly string[]
  random?: () => number
}

export interface MutteringController {
  /** 周期到点（首拍按 `immediate` 决定算不算基线） */
  tick: () => void
  /** 立即索取一句（`reason: 'manual'`），绕过周期与首拍基线 */
  request: () => void
  /** 宿主推回一句：抽动画 + 弹气泡（首拍基线窗口内丢弃） */
  show: (text: string, options?: PetMutteringShowOptions) => void
  /** 释放（此后 `tick`/`request`/`show` 全部 no-op） */
  dispose: () => void
  /** 是否处于首拍基线窗口（宿主推回的文本会被丢弃） */
  readonly baselinePending: boolean
}

/**
 * 创建一台碎碎念控制器（纯逻辑，不依赖 React / DOM，可单测）。
 *
 * @example
 * const controller = createMutteringController({
 *   enabled: true, prompt: '你是…', intervalSec: 300, duration: 10_000, image: false,
 *   onMuttering: (prompt, event) => console.log(prompt, event.reason),
 *   onPlay: name => console.log('play', name),
 *   onShow: (text, options) => console.log(text, options.duration),
 * })
 * controller.tick()   // 首拍：reason = 'baseline'，随后的 show() 被丢弃
 * controller.tick()   // 第二拍：reason = 'tick'，show() 正常展示
 */
export function createMutteringController(options: MutteringControllerOptions): MutteringController {
  const random = options.random ?? Math.random
  /** 是否已发生过首拍 */
  let started = false
  /** 首拍基线窗口：期间宿主推回的文本丢弃（对应 dsh-pet 的 `hasBaseline`） */
  let baselinePending = false
  /** 上一次抽中的动画名（下次避开，避免连续重复） */
  let previousAnimation: string | undefined
  let disposed = false

  const emit = (reason: PetMutteringReason): void => {
    const { onMuttering } = options
    if (disposed || onMuttering === undefined)
      return
    const meme = options.image ? pickMeme(options.memes, random) : undefined
    const event: PetMutteringEvent = {
      petId: options.petId,
      reason,
      intervalSec: options.intervalSec,
      meme,
    }
    try {
      onMuttering(options.prompt, event)
    }
    catch (error) {
      // 宿主回调抛错不能打断周期：碎碎念失败一律静默（对齐 dsh-pet 的 console.warn 路径）
      console.warn('[dsh-pet-component] onMuttering 回调抛错：', error)
    }
  }

  const tick = (): void => {
    if (disposed || !options.enabled)
      return
    const reason: PetMutteringReason = started || options.immediate ? 'tick' : 'baseline'
    started = true
    baselinePending = reason === 'baseline'
    emit(reason)
  }

  const request = (): void => {
    if (disposed)
      return
    started = true
    baselinePending = false
    emit('manual')
  }

  const show = (text: string, showOptions?: PetMutteringShowOptions): void => {
    if (disposed)
      return
    const value = String(text ?? '').trim()
    if (value === '')
      return
    // 首拍基线窗口：只记基线不展示（dsh-pet 首拉不触发的等价实现）
    if (baselinePending) {
      baselinePending = false
      return
    }
    const name = pick(options.whisperPool ?? [], previousAnimation, random)
    if (name !== undefined)
      previousAnimation = name
    options.onPlay(name)
    options.onShow(value, {
      image: showOptions?.image,
      duration: showOptions?.duration ?? options.duration,
    })
  }

  return {
    tick,
    request,
    show,
    dispose(): void {
      disposed = true
      baselinePending = false
    },
    get baselinePending(): boolean {
      return baselinePending
    },
  }
}

export interface UseMutteringOptions extends Omit<MutteringControllerOptions, 'random'> {
  random?: () => number
}

export interface UseMutteringReturn {
  /** 稳定命令面（挂到组件 ref 上的 `muttering` 命名空间） */
  handle: PetMutteringHandle
}

/**
 * 把碎碎念控制器接上周期。
 *
 * 周期用 reause 的 `useIntervalFn`（`enabled` 为假时不自动启动），首拍由单独的
 * effect 负责 —— 与 dsh-pet 客户端「启动时先拉一次、之后按周期循环」同形。
 */
export function useMuttering(options: UseMutteringOptions): UseMutteringReturn {
  const {
    enabled,
    prompt,
    intervalSec,
    immediate,
    petId,
    duration,
    image,
    memes,
    whisperPool,
    onMuttering,
    onPlay,
    onShow,
    random,
  } = options

  // 渲染层回调与随机源走 ref：消费方常写内联箭头函数，直接进依赖会让控制器每次渲染重建
  const portsRef = useRef<MutteringPorts>({ onMuttering, onPlay, onShow })
  portsRef.current = { onMuttering, onPlay, onShow }
  const randomRef = useRef(random)
  randomRef.current = random

  const controller = useMemo(() => createMutteringController({
    enabled,
    prompt,
    intervalSec,
    immediate,
    petId,
    duration,
    image,
    memes,
    whisperPool,
    onMuttering: (text, event) => portsRef.current.onMuttering?.(text, event),
    onPlay: name => portsRef.current.onPlay(name),
    onShow: (text, showOptions) => portsRef.current.onShow(text, showOptions),
    random: () => (randomRef.current ?? Math.random)(),
  }), [duration, enabled, image, immediate, intervalSec, memes, petId, prompt, whisperPool])

  const tick = useCallback(() => controller.tick(), [controller])
  useIntervalFn(tick, intervalSec * 1000, { immediate: enabled })

  // 首拍：只在这里发起一次（StrictMode 的双跑由 startedRef 挡掉，避免宿主被打两次）
  const startedRef = useRef(false)
  useEffect(() => {
    if (!enabled) {
      startedRef.current = false
      return
    }
    if (startedRef.current)
      return
    startedRef.current = true
    controller.tick()
  }, [controller, enabled])

  useUnmount(() => controller.dispose())

  const show = useCallback(
    (text: string, showOptions?: PetMutteringShowOptions) => controller.show(text, showOptions),
    [controller],
  )
  const request = useCallback(() => controller.request(), [controller])

  const showRef = useRef(show)
  showRef.current = show
  const requestRef = useRef(request)
  requestRef.current = request

  const handleRef = useRef<PetMutteringHandle | null>(null)
  if (handleRef.current === null) {
    const call = ((text: string, showOptions?: PetMutteringShowOptions) => {
      showRef.current(text, showOptions)
    }) as PetMutteringHandle
    call.request = () => requestRef.current()
    handleRef.current = call
  }

  return { handle: handleRef.current }
}
