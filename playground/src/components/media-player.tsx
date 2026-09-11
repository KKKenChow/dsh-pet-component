import { useMediaControls } from '@reause/core'
import { useEffect, useRef } from 'react'

export interface MediaPlayerProps {
  /** 要播放的动画资源地址（通常来自 `onAnimationChange`）；`null` = 没有单条视频可播 */
  src: string | null
  /** `src` 为空时的提示（例如 Codex 素材是整张图集，没有单条视频） */
  emptyHint?: string
  /** 静音，默认 `true`（宠物动作资源本身无声） */
  muted?: boolean
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0)
    return '0:00'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * 单条动画播放器 —— reause 的 `useMediaControls`（VueUse 同名 hook 的 React 移植）
 * 的用法演示：换 `src` 就重播，带播放 / 暂停、进度条、倍速。
 *
 * 与宠物本体是**两条独立链路**：这里把播放状态提成 React state
 * （`currentTime` 每帧都在变），适合「盯着看一条动画」；宠物那边要零重渲染，
 * 走的是 `useVideoCrossfade` 的双缓冲 + 命令式切换。这也是 `useMediaControls`
 * 不适合塞进 `DshPet` 内部的原因。
 *
 * `<video>` 始终挂载（`src` 为空时只盖一层提示）：
 * `useMediaControls` 靠元素身份变化重新绑定监听，条件挂载会让「首次拿到 src」
 * 那一帧绑不上，播放状态就再也不更新了。
 */
export function MediaPlayer({ src, emptyHint = '还没有可播的动画', muted = true }: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { playing, currentTime, duration, rate, buffered, toggle, seek, setRate } = useMediaControls(videoRef)

  // 换动画 → 从头播（`useMediaControls` 持有元素状态，这里只负责换 src）
  useEffect(() => {
    const element = videoRef.current
    if (element === null || src === null || element.src === src)
      return
    element.src = src
    element.load()
    void element.play().catch(() => {})
  }, [src])

  const bufferedEnd = buffered.length > 0 ? buffered[buffered.length - 1]![1] : 0
  const total = duration || bufferedEnd

  return (
    <div className="media-panel">
      <p className="motion-bar__title">
        单条动画播放器 ·
        {' '}
        <code>useMediaControls</code>
      </p>

      <div className="media-panel__stage">
        <video ref={videoRef} className="media-panel__video" muted={muted} playsInline preload="auto" />
        {src === null && <p className="media-panel__empty">{emptyHint}</p>}
      </div>

      <div className="media-panel__bar">
        <button type="button" className="btn btn--chip" onClick={toggle}>
          {playing ? '暂停' : '播放'}
        </button>
        <span className="media-panel__time">
          {formatTime(currentTime)}
          {' / '}
          {formatTime(total)}
        </span>
        <input
          className="media-panel__seek"
          type="range"
          min={0}
          max={Math.max(total, 0.1)}
          step={0.05}
          value={Math.min(currentTime, total)}
          onChange={event => seek(Number(event.target.value))}
        />
        {[0.5, 1, 2].map(value => (
          <button
            key={value}
            type="button"
            className={`btn btn--chip${rate === value ? ' is-active' : ''}`}
            onClick={() => setRate(value)}
          >
            {value}
            ×
          </button>
        ))}
      </div>
    </div>
  )
}
