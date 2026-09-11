import type { CSSProperties } from 'react'
import type { IdleRollPick } from '../config'
import type { DshPetConfig, DshPetProps, PetAnimationInfo, PetRenderMotion } from '../types'
import { usePreferredReducedMotion } from '@reaxuse/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isLoopingMotion,
  PET_ASPECT_RATIO,
  PET_DEFAULT_EXT,
  PET_DEFAULT_MOTION,
  PET_DEFAULT_SIZE_PERCENT,
  PET_HIT_BOX,
  resolveDshAnimation,
  resolvePetSize,
  resolveWeights,
  selectPetEntry,
  supportsIdleRoll,
} from '../config'
import { useCachedMediaUrl } from '../hooks/use-cached-media'
import { useConfig } from '../hooks/use-config'
import { useIdleRoll } from '../hooks/use-idle-roll'
import { usePetMotion } from '../hooks/use-pet-motion'
import { useVideoCrossfade } from '../hooks/use-video-crossfade'
import { mountPetStyles } from '../styles'
import { resolveAssetUrl, resolvePlatformValue } from '../utils/env'
import { createSeededRandom } from '../utils/random'
import { useIsomorphicLayoutEffect } from '../utils/react'

/** 一次真正下发给媒体层的播放目标（含展示用的动画名）。 */
interface DshPlayback {
  /** 动画名（资源文件名主名） */
  name: string
  /** 该次播放归属的动作（决定镜像等表现） */
  motion: PetRenderMotion
  /** 是否播放一次（`false` = 循环） */
  once: boolean
  /** 重播序号：同一个动画名重复播放时递增，用于强制重新播 */
  seq: number
}

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * **dsh-pet 渲染器** —— 逐动作透明视频（默认 VP9-alpha `.webm`，macOS 用
 * HEVC-with-Alpha `.mov`）。
 *
 * 播放链路：`Motion` → 配置池解析出动画名 → `uri/<动画名>.<ext>` →
 * （可选）IndexedDB 缓存 → **双 `<video>` 缓冲淡入淡出**（见 `useVideoCrossfade`）。
 *
 * 拖动（`dragging`）表现为「被无形抓起悬空」：只取 `animations.drag` 池，
 * 不会去播 `moves` 池的走路动画（那套是自动漫游用的，本组件不做漫游）。
 *
 * ```tsx
 * <DshPet
 *   size={320}
 *   config="https://…/dsh-pet/assets/config.jsonc"
 *   ext={{ default: 'webm', mac: 'mov' }}
 *   uri={{ default: 'https://…/assets/webm', mac: 'https://…/mov' }}
 *   motion={{ type: 'working', loop: true }}
 *   dragging={isDragging}
 *   cache
 * />
 * ```
 */
export function DshPet(props: DshPetProps) {
  const {
    size,
    config: configSource,
    ext = PET_DEFAULT_EXT,
    uri,
    motion,
    dragging = false,
    cache = true,
    hitboxRef,
    onHitboxPointerDown,
    onHitboxPointerUp,
    onHitboxPointerCancel,
    mirrored,
    hidden,
    className,
    style,
    onMotionChange,
    onAnimationChange,
    onReady,
    onError,
    ref,
  } = props

  // 组件样式：layout effect 里注入，保证首帧就有布局（SSR 下退化为 no-op）
  useIsomorphicLayoutEffect(() => {
    mountPetStyles()
  }, [])

  const { config, error: configError } = useConfig<DshPetConfig>(configSource)
  const { state, finish } = usePetMotion({ motion, ref, onMotionChange })
  // 减少动效跟随系统偏好（`prefers-reduced-motion`，reaxuse 的媒体查询 hook）
  const reducedMotion = usePreferredReducedMotion() === 'reduce'

  useEffect(() => {
    if (configError !== null)
      onError?.(configError)
  }, [configError, onError])

  /* ------------------------------- 尺寸与动作名 ------------------------------ */

  const petEntry = useMemo(() => selectPetEntry(config), [config])
  const width = resolvePetSize({ size, config, petEntry, sizePercent: PET_DEFAULT_SIZE_PERCENT })
  const height = width * PET_ASPECT_RATIO

  // 手势态优先于会话动作：拖动时一律走 drag 池（悬浮），`motion` 给的方向被忽略
  const renderMotion: PetRenderMotion = dragging ? 'dragging' : state.type

  const lastAnimationRef = useRef<string | undefined>(undefined)
  const animationName = useMemo(
    () =>
      resolveDshAnimation({
        motion: renderMotion,
        config,
        previous: lastAnimationRef.current,
        // 动作代次当种子：同一次动作内抽签结果稳定（重复渲染不会换动画），
        // 换动作 / 强制重播时重新抽 —— 多候选池因此会换一段
        random: createSeededRandom(state.revision),
      }),
    [config, renderMotion, state.revision],
  )

  useEffect(() => {
    if (animationName !== null)
      lastAnimationRef.current = animationName
  }, [animationName])

  /* -------------------------------- 空闲掷骰链 ------------------------------- */

  const [adHoc, setAdHoc] = useState<{ pick: IdleRollPick, seq: number } | null>(null)
  const adHocSeqRef = useRef(0)
  const adHocRef = useRef(adHoc)
  adHocRef.current = adHoc

  // 空闲掷骰链：配置给了权重或分类池就开启（dsh-pet 的动画链语义）
  const idleRollEnabled = config !== null && supportsIdleRoll(config)
  const turnPool = config?.animations?.turn ?? []
  const idlePool = config?.animations?.idle ?? []
  const categories = config?.animations?.categories ?? []
  const weights = useMemo(() => resolveWeights(config?.animationWeights), [config?.animationWeights])

  useIdleRoll({
    enabled: idleRollEnabled,
    // 只在「纯待机」时掷骰：拖动中、一次性插播期间、非 idle 动作期间都不排新定时器
    active: !dragging && state.type === PET_DEFAULT_MOTION && state.loop && adHoc === null,
    weights,
    turnPool,
    idlePool,
    categories,
    facing: 'left',
    current: lastAnimationRef.current,
    reducedMotion,
    onPick: (pick) => {
      adHocSeqRef.current += 1
      setAdHoc({ pick, seq: adHocSeqRef.current })
    },
  })

  /* --------------------------------- 播放目标 -------------------------------- */

  const playback = useMemo<DshPlayback | null>(() => {
    if (dragging) {
      // 拖动：drag 池（可能为空 → resolveDshAnimation 回落到 idle 池）
      const dragName = animationName
      if (dragName === null)
        return null
      return { motion: 'dragging', name: dragName, once: !isLoopingMotion('dragging'), seq: state.revision }
    }
    // 插播（点击回应/空闲掷骰）优先级更高，且一律播一次
    if (adHoc !== null)
      return { motion: adHoc.pick.motion, name: adHoc.pick.name, once: true, seq: adHoc.seq }
    if (animationName === null)
      return null
    return { motion: state.type, name: animationName, once: !state.loop, seq: state.revision }
  }, [adHoc, animationName, dragging, state.loop, state.revision, state.type])

  const playbackRef = useRef(playback)
  playbackRef.current = playback

  const animationExt = resolvePlatformValue(ext)
  const assetBase = resolvePlatformValue(uri)
  const assetUrl = playback === null ? null : resolveAssetUrl(assetBase, playback.name, animationExt)
  const src = useCachedMediaUrl(assetUrl, cache, onError)

  /* --------------------------------- 媒体播放 -------------------------------- */

  const handleVideoEnded = useCallback(() => {
    const current = playbackRef.current
    if (current === null || !current.once)
      return
    // 插播（一次性风味动作）播完：先摘掉插播，回到会话/待机动作
    if (adHocRef.current !== null) {
      setAdHoc(null)
      return
    }
    finish()
  }, [finish])

  const swapTarget = useMemo(
    () => (src === null || playback === null ? null : { src, once: playback.once, seq: playback.seq }),
    [playback, src],
  )

  const { videoARef, videoBRef, frontIndex } = useVideoCrossfade({
    target: swapTarget,
    onEnded: handleVideoEnded,
    onReady: () => onReady?.(),
    onError,
  })
  const frontARef = frontIndex === 0

  /* -------------------------------- 动画信息回调 ------------------------------ */

  const animationInfo = useMemo<PetAnimationInfo | null>(
    () => (playback === null ? null : { name: playback.name, once: playback.once, src: assetUrl }),
    [assetUrl, playback],
  )
  useIsomorphicLayoutEffect(() => {
    onAnimationChange?.(animationInfo)
  }, [animationInfo, onAnimationChange])

  /* ---------------------------------- 渲染 ---------------------------------- */

  // 走路素材默认朝左，`moving-right` 时镜像（与 dsh-pet 的 facing 一致）；
  // 拖动的悬空姿势不带方向，所以 `dragging` 不镜像。`mirrored` prop 可以整体覆盖。
  const shouldMirror = mirrored ?? renderMotion === 'moving-right'
  const videoClassName = (isFront: boolean) => joinClassNames(
    'dsh-pet__media',
    'dsh-pet__video',
    isFront && 'is-front',
    shouldMirror && 'dsh-pet__media--mirrored',
  )

  const rootStyle: CSSProperties = {
    width: `${width}px`,
    height: `${height}px`,
    ...style,
  }

  return (
    <div
      className={joinClassNames('dsh-pet', hidden && 'dsh-pet--hidden', className)}
      data-motion={renderMotion}
      data-animation={playback?.name}
      style={rootStyle}
    >
      {/* 双缓冲：前台淡入、后台淡出；两个 video 都常驻 DOM，切换时只换 class 与 src。
          opacity 同时内联一份 —— 万一样式表没能注入（极端 CSP），也不会出现两层视频叠着显示；
          过渡时长与 prefers-reduced-motion 由样式表提供。 */}
      <video
        ref={videoARef}
        className={videoClassName(frontARef)}
        style={{ opacity: frontARef ? 1 : 0 }}
        muted
        playsInline
        preload="auto"
        onError={() => onError?.(new Error(`Failed to play pet animation: ${playbackRef.current?.name ?? 'unknown'}`))}
      />
      <video
        ref={videoBRef}
        className={videoClassName(!frontARef)}
        style={{ opacity: frontARef ? 0 : 1 }}
        muted
        playsInline
        preload="auto"
        onError={() => onError?.(new Error(`Failed to play pet animation: ${playbackRef.current?.name ?? 'unknown'}`))}
      />
      <div
        ref={hitboxRef}
        className="dsh-pet__hitbox"
        style={PET_HIT_BOX}
        onPointerDown={onHitboxPointerDown}
        onPointerUp={onHitboxPointerUp}
        onPointerCancel={onHitboxPointerCancel}
      />
    </div>
  )
}
