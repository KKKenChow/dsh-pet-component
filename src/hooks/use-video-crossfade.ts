import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

/**
 * 一次真正下发给媒体层的播放目标。
 *
 * - `src`：资源地址（不是动画名 —— 换宠物时同名动画的 URL 不同，必须重载）
 * - `once`：一次性 / 循环语义（决定 `video.loop` 与 `ended` 回落）
 * - `seq`：显式重播序号（同一动画再放一次时递增）
 */
export interface VideoSwapTarget {
  src: string
  once: boolean
  seq: number
}

/**
 * 是否需要重载视频来切换动画（纯函数，可单测）。
 *
 * 动画是否重播只由播放目标决定：资源变了、循环语义变了、或者显式要求重播（`seq`）
 * 才重载。动作档位本身刻意不进目标 —— 会话状态反复上报（同一档位重复到达）
 * 不该让同一个动画一直从头播。
 */
export function shouldReloadAnimation(
  previous: VideoSwapTarget | null,
  next: VideoSwapTarget,
): boolean {
  if (previous === null)
    return true
  return previous.src !== next.src
    || previous.once !== next.once
    || previous.seq !== next.seq
}

export interface UseVideoCrossfadeOptions {
  /** 当前播放目标；`null` = 还没有可播资源 */
  target: VideoSwapTarget | null
  /** 前台视频播放结束（仅 `once` 目标） */
  onEnded?: () => void
  /** 新动画就位并开始播放 */
  onReady?: (src: string) => void
  onError?: (error: unknown) => void
}

export interface UseVideoCrossfadeResult {
  videoARef: RefObject<HTMLVideoElement | null>
  videoBRef: RefObject<HTMLVideoElement | null>
  /** 当前前台缓冲（0 = A，1 = B）；用于挂 `is-front` 类做淡入淡出 */
  frontIndex: 0 | 1
}

/**
 * 双 `<video>` 缓冲 + 淡入淡出的动画切换 —— 移植自 dsh-pet 的 `switchTo`
 * （`source/dsh-pet/dsh-pet/src/client/pet.ts`）与 `deepseek-harness-desktop` 的同名实现。
 *
 * 为什么不能只用一个 `<video>` 换 `src`：新资源在后台加载期间前台会空窗/黑帧
 * （透明视频尤其明显，切动作时宠物会「闪一下」）。这里新动画先在**后台缓冲**加载，
 * `loadeddata` 之后才交换前台并淡入、旧缓冲淡出 + `pause()`，全程无空窗。
 */
export function useVideoCrossfade(options: UseVideoCrossfadeOptions): UseVideoCrossfadeResult {
  const { target, onEnded, onReady, onError } = options

  const videoARef = useRef<HTMLVideoElement | null>(null)
  const videoBRef = useRef<HTMLVideoElement | null>(null)
  const frontIndexRef = useRef<0 | 1>(0)
  const [frontIndex, setFrontIndex] = useState<0 | 1>(0)
  /** 正在后台加载的切换代次；`loadeddata` 回调据此判断自己是否已被更新的切换取代 */
  const pendingRef = useRef<number | null>(null)
  /** 已下发的播放目标；目标不变即不重载 */
  const appliedRef = useRef<VideoSwapTarget | null>(null)
  const genRef = useRef(0)

  const callbacksRef = useRef({ onEnded, onReady, onError })
  callbacksRef.current = { onEnded, onReady, onError }

  useEffect(() => {
    if (target === null)
      return undefined
    if (!shouldReloadAnimation(appliedRef.current, target))
      return undefined

    const back = frontIndexRef.current === 0 ? videoBRef.current : videoARef.current
    if (back === null)
      return undefined

    const gen = ++genRef.current
    pendingRef.current = gen

    back.src = target.src
    back.loop = !target.once
    back.muted = true
    back.load()

    // 只有前台缓冲的 ended 才作数：被降级的后台缓冲已 pause，双保险再校验一次来源
    back.onended = target.once
      ? (event) => {
          const front = frontIndexRef.current === 0 ? videoARef.current : videoBRef.current
          if ((event.currentTarget as HTMLVideoElement | null) !== front)
            return
          callbacksRef.current.onEnded?.()
        }
      : null

    const finishSwap = () => {
      if (pendingRef.current !== gen)
        return
      const old = frontIndexRef.current === 0 ? videoARef.current : videoBRef.current
      if (old !== null && old !== back) {
        // 拆雷：降级为背景的视频继续播完会触发它身上残留的 ended，掐断当前前台动画；
        // 清 handler + 停播彻底消除（历史上表现为随机急速跳转/雪崩）
        old.onended = null
        old.pause()
      }
      frontIndexRef.current = frontIndexRef.current === 0 ? 1 : 0
      // 交换前台发生在 loadeddata 事件回调里（不是 effect 同步阶段），
      // 规则无法区分事件回调与渲染副作用。
      // eslint-disable-next-line react/set-state-in-effect -- 交换前台缓冲需要同步 className（is-front）
      setFrontIndex(frontIndexRef.current)
      appliedRef.current = target
      pendingRef.current = null
      void back.play().catch((error: unknown) => callbacksRef.current.onError?.(error))
      callbacksRef.current.onReady?.(target.src)
    }

    const handleLoadedData = () => {
      back.removeEventListener('loadeddata', handleLoadedData)
      finishSwap()
    }
    back.addEventListener('loadeddata', handleLoadedData)
    // 元素已就绪（缓存命中 / 同一资源复用）时事件不会再来，立即交换
    if (back.readyState >= 2) {
      back.removeEventListener('loadeddata', handleLoadedData)
      finishSwap()
    }

    return () => {
      back.removeEventListener('loadeddata', handleLoadedData)
      // 本次加载尚未完成（StrictMode 双挂载 / 依赖变化提前清理）：清掉 pending，
      // 让下一次 effect 重新发起加载，避免「监听器已移除但 pending 仍在」的死锁
      if (pendingRef.current === gen)
        pendingRef.current = null
    }
  }, [target])

  return { videoARef, videoBRef, frontIndex }
}
