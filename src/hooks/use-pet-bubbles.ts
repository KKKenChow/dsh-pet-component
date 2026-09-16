import type { PetBubble, PetBubbleHandle, PetBubbleOptions } from '../types/bubble'
import type { MotionInput } from '../types/motion'
import type { BubbleTracker } from '../utils/bubble-tracker'
import { useUnmount } from '@reause/core'
import { useRef, useState } from 'react'
import { createBubbleTracker } from '../utils/bubble-tracker'

/**
 * 会话气泡的 React 接线 —— 与参考实现的 `src/pet/hooks/use-bubble.ts` 同形：
 *
 * | 职责 | 参考实现 | 这里 |
 * | --- | --- | --- |
 * | 订阅宿主事件 | `useListen('session:create|update|remove')` ×3 | 宿主直接调 `pet.bubble(...)` |
 * | 状态机 | `createBubbleTracker` | `createBubbleTracker`（`../utils/bubble-tracker`） |
 * | 释放 | `useUnmount(() => tracker.dispose())` | 同 |
 * | 对外 | `{ motion }` | `{ bubbles, motion, handle }` |
 *
 * 状态机在 ref 里惰性创建（StrictMode 的重复渲染不会重建），所以它跨渲染保持会话登记。
 */
export interface UsePetBubblesOptions {
  /** 每个 placement 的同时可见上限（缺省 3） */
  max?: number
  /** 某条气泡创建（仅一次） */
  onShow?: (bubble: PetBubble) => void
  /** 某条气泡原地更新 */
  onUpdate?: (bubble: PetBubble, previous: PetBubble) => void
}

export interface UsePetBubblesReturn {
  /** 当前可见气泡（旧 → 新） */
  bubbles: readonly PetBubble[]
  /** 聚合出的动作档位（`undefined` = 没有会话要驱动动作，回落 `motion` prop） */
  motion: MotionInput | undefined
  /** 命令面：`pet.bubble(options)` / `.close(id?)` / `.clear()` */
  handle: PetBubbleHandle
}

export function usePetBubbles(options: UsePetBubblesOptions = {}): UsePetBubblesReturn {
  const { max, onShow, onUpdate } = options
  const [bubbles, setBubbles] = useState<readonly PetBubble[]>([])
  const [motion, setMotion] = useState<MotionInput | undefined>(undefined)

  // 回调走 ref：宿主常写内联箭头函数，直接进依赖会把状态机重建
  const portsRef = useRef({ onShow, onUpdate })
  portsRef.current = { onShow, onUpdate }

  const trackerRef = useRef<BubbleTracker | null>(null)
  trackerRef.current ??= createBubbleTracker({
    maxVisible: max,
    onBubbles: setBubbles,
    onMotion: setMotion,
    onShow: bubble => portsRef.current.onShow?.(bubble),
    onUpdate: (bubble, previous) => portsRef.current.onUpdate?.(bubble, previous),
  })
  const tracker = trackerRef.current

  useUnmount(() => tracker.dispose())

  const handleRef = useRef<PetBubbleHandle | null>(null)
  if (handleRef.current === null) {
    const call = ((bubble: PetBubbleOptions) => trackerRef.current?.show(bubble) ?? '') as PetBubbleHandle
    call.close = (id?: string) => trackerRef.current?.close(id)
    call.clear = () => trackerRef.current?.clear()
    handleRef.current = call
  }

  return { bubbles, motion, handle: handleRef.current }
}
