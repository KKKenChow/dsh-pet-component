import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react'
import type { CodexPetConfig, DshPetConfig, MotionInput, PetBubble, PetConfig, PetProps, PetRef } from '../types'
import { useElementSize } from '@reause/core'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { detectPetKind, dshEventPool, resolveMutteringPlan, selectPetEntry } from '../config'
import { useConfig } from '../hooks/use-config'
import { useControllablePet } from '../hooks/use-controllable-pet'
import { useDoubleClick } from '../hooks/use-double-click'
import { useMuttering } from '../hooks/use-muttering'
import { usePetBubbles } from '../hooks/use-pet-bubbles'
import { resolveBubbleMotion } from '../utils/bubble'
import { PetBubbleLayer } from './bubble-layer'
import { CodexPet } from './codex-pet'
import { DshPet } from './dsh-pet'

/** 碎碎念气泡的固定 key：同一时刻只有一句碎碎念，重复触发=原地换句（不重新淡入）。 */
const MUTTERING_BUBBLE_ID = 'dsh-pet-muttering'

/** 外壳样式：自定义属性（`--dsh-pet-size`）在 `CSSProperties` 里没有位置，单独声明。 */
type ShellStyle = CSSProperties & Record<`--${string}`, string>

/**
 * 合并 ref：宿主的 ref 原样转发（对象 ref 与回调 ref 都支持、回调返回的清理函数也照传），
 * 同时把同一个命令面句柄留在内部 ref 上 —— 内置双击要用它下发 `waving`。
 *
 * 这样 `<Pet config uri />` 不传 ref 时双击同样有效，传了 ref 的宿主也不受影响。
 */
function useMergedRef(hostRef: Ref<PetRef | null> | undefined, innerRef: RefObject<PetRef | null>): Ref<PetRef | null> {
  return useCallback((node: PetRef | null) => {
    innerRef.current = node
    if (typeof hostRef === 'function') {
      const cleanup = hostRef(node)
      if (typeof cleanup === 'function') {
        return () => {
          innerRef.current = null
          cleanup()
        }
      }
      return
    }
    if (hostRef !== null && hostRef !== undefined)
      (hostRef as RefObject<PetRef | null>).current = node
  }, [hostRef, innerRef])
}

/**
 * **桌宠统一入口** —— 按 `config` / `uri` 自动判定渲染器，也可以 `kind` 强制指定。
 *
 * 判定规则（见 `detectPetKind`）：
 * - dsh-pet `config.jsonc`（有 `animations` / `pets` / …）→ `DshPet`（透明视频）
 * - Codex `pet.json`（有 `spriteVersionNumber` / `spritesheetPath` / …）→ `CodexPet`（雪碧图集）
 * - 两种都像或都不像时看 `uri`：图片扩展名 = Codex，`{ default, mac }` 对象 = dsh-pet
 *
 * 配置加载在这里统一做（URL 形态先拉一次），所以判定发生在拿到真实配置之后，
 * 不会因为「猜错渲染器」而闪一下。
 *
 * **公开命令面只有这一处**（`PetRef`）：渲染器内部只写 `motion` / `clear` / `current`，
 * 本层把气泡（`PetBubbleHandle`）与碎碎念（`PetMutteringHandle`）两个命名空间并上去 ——
 * 一个 ref 只能被一处 `useImperativeHandle` 写，而两个渲染器都不需要知道「气泡」这件事。
 *
 * ```tsx
 * const petRef = useRef<PetRef>(null)
 * const pet = useControllablePet(petRef)
 *
 * pet.motion({ type: 'thinking', loop: true })
 * pet.bubble({ id: 's1', title: '会话', description: '正在处理', loading: true, motion: 'thinking' })
 * pet.bubble({ id: 's1', description: '已完成', loading: false, motion: 'success' })  // 原地更新
 * pet.muttering('今天风好大')
 *
 * return (
 *   <Pet
 *     ref={petRef}
 *     config="/pets/main/config.jsonc"
 *     uri={{ default: '/pets/main/webm' }}
 *     muttering
 *     onMuttering={(prompt, { meme }) => { …生成后 pet.muttering(text, …) 推回 }}
 *   />
 * )
 * ```
 *
 * **单击/双击是内置行为**：命中框上两次按下间隔小于 `DOUBLE_CLICK_MS` 即插播一次
 * `waving`（dsh-pet 取 `animations.clicks` 池，Codex 走 `waving` 行），宿主不必自己判定；
 * 判定挂在你传入的 `onHitboxPointerDown` 之外，宿主自己的指针回调照常收到事件。
 *
 * **气泡层的定位**：`Pet` 自己套一层 `.dsh-pet-shell`（inline-block，不改变宿主布局），
 * 渲染器与气泡层都在其中；`--dsh-pet-size` 由实测宽度写在壳体上，气泡据此等比缩放。
 * 也就是说气泡只存在于这一层 —— `DshPet` / `CodexPet` 里没有任何气泡逻辑。
 */
export function Pet(props: PetProps) {
  const {
    kind,
    config,
    uri,
    ext,
    lookAtPointer,
    lookDeadzone,
    ref,
    motion,
    muttering,
    mutteringPrompt,
    mutteringIntervalSec,
    mutteringImmediate,
    mutteringImage,
    mutteringDuration,
    mutteringMotion,
    onMuttering,
    ...common
  } = props
  const { config: loaded, error } = useConfig<PetConfig>(config)
  const { onError } = common

  /* --------------------------------- 句柄基础 -------------------------------- */

  // 渲染器只写 `motionRef`（`usePetMotion` 的 `useImperativeHandle`），公开句柄在下面组合
  const shellRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<PetRef | null>(null)
  const motionRef = useRef<PetRef | null>(null)
  const mergedRef = useMergedRef(ref, innerRef)
  const pet = useControllablePet(innerRef)

  useEffect(() => {
    if (error !== null)
      onError?.(error)
  }, [error, onError])

  // 地址形态的配置还在路上时，先用原始 source 交给子渲染器（配置缓存会去重，不会重复拉）
  const resolved = loaded ?? config
  const resolvedKind = kind ?? detectPetKind(loaded, uri)
  // 碎碎念与配图是 dsh-pet 协议的字段（Codex 图集没有 whisper 行）
  const dshConfig = loaded !== null && resolvedKind === 'dsh' ? loaded as DshPetConfig : null
  const petEntry = useMemo(() => (dshConfig === null ? null : selectPetEntry(dshConfig)), [dshConfig])
  const whisperPool = useMemo(() => dshEventPool(dshConfig?.animations, 'whisper'), [dshConfig])

  /** 下发动作（捆绑动画与回落都走它；`motionRef` 由渲染器写入） */
  const motionRequest = useCallback((input: MotionInput) => {
    motionRef.current?.motion(input)
  }, [])
  /** 清除动作，回落 `motion` prop */
  const motionClear = useCallback(() => {
    motionRef.current?.clear()
  }, [])

  /* ---------------------------------- 气泡 --------------------------------- */

  const { bubbles, handle: bubbleHandle } = usePetBubbles({
    // 捆绑运行动画：气泡出现即下发；收起时按 `restore` 回落 —— 宿主聚合出的档位
    // （会话状态 → Motion）在这里变成真实动作，组件不做优先级判定
    onShow: (bubble: PetBubble) => {
      if (bubble.motion !== undefined)
        motionRequest(bubble.motion)
    },
    // 原地更新时档位换了（加载态 → 完成态）必须重发一次，否则画面停在加载态的动作上
    onUpdate: (bubble: PetBubble, previous: PetBubble) => {
      const motion = resolveBubbleMotion(bubble, previous)
      if (motion !== undefined)
        motionRequest(motion)
    },
    onClose: (bubble: PetBubble) => {
      if (bubble.restore)
        motionClear()
    },
  })

  // 有气泡处于加载态时碎碎念整体禁用（别让后台碎碎念打断正在跑的会话）
  const mutteringSuspended = bubbles.some(bubble => bubble.loading)

  // 气泡全部尺寸以宠物**实测宽度**等比缩放（`--dsh-pet-size`）：实测而不是按配置推算，
  // 这样宿主的 `size` / 配置 / CSS 覆盖最终都落在同一个基准上
  const { width } = useElementSize(shellRef)

  /* --------------------------------- 碎碎念 -------------------------------- */

  const plan = useMemo(() => resolveMutteringPlan({
    config: dshConfig,
    entry: petEntry,
    enabled: muttering,
    prompt: mutteringPrompt,
    intervalSec: mutteringIntervalSec,
    immediate: mutteringImmediate,
    image: mutteringImage,
    duration: mutteringDuration,
  }), [dshConfig, petEntry, muttering, mutteringDuration, mutteringImage, mutteringImmediate, mutteringIntervalSec, mutteringPrompt])

  /** 按动画名的一次性插播（dsh 渲染器专用通道，见 `DshPetProps.adHocAnimation`） */
  const [adHocAnimation, setAdHocAnimation] = useState<{ name: string, seq: number } | null>(null)
  const adHocSeqRef = useRef(0)

  const { handle: mutteringHandle } = useMuttering({
    enabled: plan.enabled,
    prompt: plan.prompt,
    intervalSec: plan.intervalSec,
    immediate: plan.immediate,
    petId: plan.petId,
    duration: plan.duration,
    image: plan.image,
    memes: dshConfig?.memes,
    whisperPool,
    suspended: mutteringSuspended,
    onMuttering,
    // 碎碎念动画：dsh 取 `animations.events.whisper` 整池里的一段动画名（不属于 14 个动作，
    // 走渲染器的一次性插播通道）；池为空（Codex 图集 / 配置没写）时回落 `mutteringMotion`
    onPlay: (name) => {
      if (name === undefined) {
        const fallback = mutteringMotion ?? 'waving'
        motionRequest(typeof fallback === 'string'
          ? { type: fallback, replay: true }
          : { ...fallback, replay: true })
        return
      }
      adHocSeqRef.current += 1
      setAdHocAnimation({ name, seq: adHocSeqRef.current })
    },
    onShow: (text, options) => {
      bubbleHandle({
        id: MUTTERING_BUBBLE_ID,
        kind: 'muttering',
        description: text,
        image: options.image,
        timeout: options.duration,
        placement: 'top',
        // 碎碎念动画由渲染器的插播通道播放、播完自动回落到宿主的状态，
        // 所以气泡收起时**不能** clear 掉宿主的动作
        restore: false,
      })
    },
  })

  /* --------------------------------- 公开句柄 -------------------------------- */

  const handle = useMemo<PetRef>(() => ({
    motion: motionRequest,
    clear: motionClear,
    get current() {
      return motionRef.current?.current ?? 'idle'
    },
    bubble: bubbleHandle,
    muttering: mutteringHandle,
  }), [bubbleHandle, motionClear, motionRequest, mutteringHandle])

  useImperativeHandle(mergedRef, () => handle, [handle])

  /* --------------------------------- 点击回应 -------------------------------- */

  // 命中框上连按两次 → 插播一次 waving（`replay` 不能省，否则同动作会被去重）；
  // 拖动会话会作废判定窗口，所以「拖一下再快速点一下」不算双击
  const onDoubleClick = useDoubleClick(
    () => pet.motion({ type: 'waving', replay: true }),
    { interrupted: common.dragging === true },
  )

  // 内置判定只做叠加：先判双击，再把原生指针事件原样透传给宿主的回调
  const onHitboxPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onDoubleClick()
    common.onHitboxPointerDown?.(event)
  }

  /* ---------------------------------- 渲染 --------------------------------- */

  const shellStyle: ShellStyle | undefined = width > 0 ? { '--dsh-pet-size': `${width}px` } : undefined
  // 宠物被 `hidden` 藏起来时气泡一起藏（气泡长在它身上）
  const bubbleLayer = common.hidden === true ? null : <PetBubbleLayer bubbles={bubbles} />

  if (resolvedKind === 'codex') {
    return (
      <div ref={shellRef} className="dsh-pet-shell" style={shellStyle}>
        <CodexPet
          {...common}
          motion={motion}
          ref={motionRef}
          onHitboxPointerDown={onHitboxPointerDown}
          config={resolved as CodexPetConfig}
          uri={typeof uri === 'string' ? uri : uri?.default}
          lookAtPointer={lookAtPointer}
          lookDeadzone={lookDeadzone}
        />
        {bubbleLayer}
      </div>
    )
  }
  const isMoving = (motion === 'moving-left' || motion === 'moving-right') && common.dragging
  return (
    <div ref={shellRef} className="dsh-pet-shell" style={shellStyle}>
      <DshPet
        {...common}
        motion={isMoving ? undefined : motion}
        ref={motionRef}
        adHocAnimation={adHocAnimation}
        onHitboxPointerDown={onHitboxPointerDown}
        config={resolved as DshPetConfig}
        uri={typeof uri === 'string' ? { default: uri } : (uri ?? { default: '' })}
        ext={ext}
      />
      {bubbleLayer}
    </div>
  )
}
