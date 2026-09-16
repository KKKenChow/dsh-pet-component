import type { PetBubble, PetBubbleHandle, PetBubbleOptions } from '../types'
import { useUnmount } from '@reause/core'
import { useRef, useState } from 'react'
import { createBubble, MAX_VISIBLE_BUBBLES, updateBubble } from '../utils/bubble'

/**
 * 气泡队列 —— **React 无关的状态容器** + 一层薄 hook。
 *
 * 为什么不把状态塞进 `useEffect`：参考实现（`source/deepseek-harness-desktop` 的
 * `src/pet/utils/bubble-tracker.ts`）在注释里记过同一个教训 —— 状态容器与订阅混在
 * 一个几百行的 effect 里，既没法单测，也让「叠加 / 原地更新 / 上限淘汰」这三条规则
 * 被埋起来。所以这里：
 *
 * - `createBubbleQueue()` 是纯逻辑（定时器可注入），可直接单测；
 * - `usePetBubbles()` 只负责把队列变化映射成 React state，并交出稳定命令面。
 *
 * 三条规则：
 * 1. **叠加**：新气泡追加在末尾（渲染时最靠近宠物）；超过 `max` 关最旧；
 * 2. **原地更新**：同 `id` 再调用只换内容，不重新淡入、不重置计时（除非显式给 `timeout`）；
 * 3. **定时收起**：`duration > 0` 的气泡到点自动关闭，重复更新不叠加定时器。
 */

/** 定时器句柄（可注入，便于测试）。 */
type TimerHandle = ReturnType<typeof setTimeout>

export interface BubbleQueueOptions {
  /** 同时可见上限，缺省 `MAX_VISIBLE_BUBBLES`（3） */
  max?: number
  /** 队列内容变化（创建 / 更新 / 关闭）时回调 */
  onChange?: (bubbles: readonly PetBubble[]) => void
  /** 新气泡入队时回调（捆绑运行动画在这里下发） */
  onShow?: (bubble: PetBubble) => void
  /**
   * 同 `id` 原地更新时回调（拿到更新前后两条）。
   *
   * 捆绑动画的「换档」在这里处理：宿主把加载态更新成完成态时，动画必须跟着换
   * （见 `resolveBubbleMotion`），否则画面会停在加载态的动作上。
   */
  onUpdate?: (bubble: PetBubble, previous: PetBubble) => void
  /** 气泡收起时回调（含自动收起与上限淘汰；`restore` 回落在这里做） */
  onClose?: (bubble: PetBubble) => void
  /** 定时器注入（测试用；缺省全局 `setTimeout` / `clearTimeout`） */
  setTimer?: (callback: () => void, ms: number) => TimerHandle
  /** 定时器取消注入 */
  clearTimer?: (handle: TimerHandle) => void
}

export interface BubbleQueue {
  /** 下发一条气泡：同 `id` 存在则原地更新，否则新建；返回最终 `id` */
  show: (options: PetBubbleOptions) => string
  /** 收起指定气泡；缺省 = 最近一次创建/更新的那条 */
  close: (id?: string) => void
  /** 收起全部 */
  clear: () => void
  /** 释放全部定时器（不清内容，仅停表；重复调用安全） */
  dispose: () => void
  /** 当前队列（旧 → 新） */
  readonly list: readonly PetBubble[]
}

/** 队列 id 前缀（宿主不给 `id` 时的自增 key；带前缀避免与宿主的 id 撞车）。 */
const BUBBLE_ID_PREFIX = 'dsh-pet-bubble-'

/**
 * 创建一台气泡队列（纯逻辑，不依赖 React）。
 *
 * @example
 * const queue = createBubbleQueue({ onChange: setBubbles })
 * queue.show({ title: '会话', description: '正在处理', loading: true, timeout: 0 })
 * queue.show({ id: 'dsh-pet-bubble-1', description: '已完成', loading: false }) // 原地更新
 */
export function createBubbleQueue(options: BubbleQueueOptions = {}): BubbleQueue {
  const max = Math.max(1, Math.floor(options.max ?? MAX_VISIBLE_BUBBLES))
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle))

  let items: PetBubble[] = []
  let createdSeq = 0
  let idSeq = 0
  /** 最近一次创建/更新的 id（`close()` 不给 id 时收起的对象） */
  let touchedId: string | undefined
  const timers = new Map<string, TimerHandle>()

  const emit = (): void => {
    options.onChange?.(items)
  }

  const cancelTimer = (id: string): void => {
    const timer = timers.get(id)
    if (timer === undefined)
      return
    clearTimer(timer)
    timers.delete(id)
  }

  const armTimer = (bubble: PetBubble): void => {
    cancelTimer(bubble.id)
    if (bubble.duration <= 0)
      return
    timers.set(bubble.id, setTimer(() => {
      timers.delete(bubble.id)
      close(bubble.id)
    }, bubble.duration))
  }

  function close(id?: string): void {
    const target = id ?? touchedId
    if (target === undefined)
      return
    const index = items.findIndex(item => item.id === target)
    const removed = items[index]
    if (index < 0 || removed === undefined)
      return
    items = [...items.slice(0, index), ...items.slice(index + 1)]
    cancelTimer(target)
    if (touchedId === target)
      touchedId = undefined
    options.onClose?.(removed)
    emit()
  }

  function clear(): void {
    const closing = items
    items = []
    touchedId = undefined
    for (const id of [...timers.keys()])
      cancelTimer(id)
    for (const bubble of closing)
      options.onClose?.(bubble)
    emit()
  }

  function show(input: PetBubbleOptions): string {
    const id = input.id ?? `${BUBBLE_ID_PREFIX}${++idSeq}`
    const index = items.findIndex(item => item.id === id)
    const previous = items[index]

    if (previous === undefined) {
      const bubble = createBubble(input, id, ++createdSeq)
      items = [...items, bubble]
      touchedId = id
      options.onShow?.(bubble)
      armTimer(bubble)
      // 只留最新 max 条：超出即关最旧（与 desktop 丢弃最旧条目同语义）
      while (items.length > max) {
        const oldest = items[0]
        if (oldest === undefined || oldest.id === id)
          break
        close(oldest.id)
      }
      emit()
      return id
    }

    const next = updateBubble(previous, input)
    items = [...items.slice(0, index), next, ...items.slice(index + 1)]
    touchedId = id
    // 两种情况下重排计时：显式给了 timeout（`0` 也要能取消），或时长本身变了
    // （语义色换档会带出新时长）。只换文字时计时不动，「可更新文字」不会打断自动收起
    if (input.timeout !== undefined || next.duration !== previous.duration)
      armTimer(next)
    options.onUpdate?.(next, previous)
    emit()
    return id
  }

  return {
    show,
    close,
    clear,
    dispose(): void {
      for (const id of [...timers.keys()])
        cancelTimer(id)
      items = []
      touchedId = undefined
    },
    get list(): readonly PetBubble[] {
      return items
    },
  }
}

export interface UsePetBubblesOptions {
  /** 同时可见上限，缺省 `MAX_VISIBLE_BUBBLES`（3） */
  max?: number
  /** 新气泡入队时回调（组件内部用来下发捆绑动画） */
  onShow?: (bubble: PetBubble) => void
  /** 同 `id` 原地更新时回调（组件内部用来处理动画换档） */
  onUpdate?: (bubble: PetBubble, previous: PetBubble) => void
  /** 气泡收起时回调（组件内部用来做动画回落） */
  onClose?: (bubble: PetBubble) => void
}

export interface UsePetBubblesReturn {
  /** 当前气泡队列（旧 → 新），交给渲染层叠加 */
  bubbles: readonly PetBubble[]
  /** 稳定命令面（挂到组件 ref 上的 `bubble` 命名空间） */
  handle: PetBubbleHandle
}

/**
 * 气泡队列的 React 绑定：队列内容进 state，命令面保持稳定引用。
 *
 * 回调走 ref（消费方常写内联箭头函数，直接进依赖会让队列每次渲染重建）；
 * 卸载时释放所有定时器（StrictMode 的双挂载安全：`dispose()` 幂等）。
 */
export function usePetBubbles(options: UsePetBubblesOptions = {}): UsePetBubblesReturn {
  const [bubbles, setBubbles] = useState<readonly PetBubble[]>([])
  const { max } = options

  const onShowRef = useRef(options.onShow)
  onShowRef.current = options.onShow
  const onUpdateRef = useRef(options.onUpdate)
  onUpdateRef.current = options.onUpdate
  const onCloseRef = useRef(options.onClose)
  onCloseRef.current = options.onClose

  const queueRef = useRef<BubbleQueue | null>(null)
  queueRef.current ??= createBubbleQueue({
    max,
    onChange: setBubbles,
    onShow: bubble => onShowRef.current?.(bubble),
    onUpdate: (bubble, previous) => onUpdateRef.current?.(bubble, previous),
    onClose: bubble => onCloseRef.current?.(bubble),
  })
  const queue = queueRef.current

  useUnmount(() => queue.dispose())

  const handleRef = useRef<PetBubbleHandle | null>(null)
  if (handleRef.current === null) {
    const call = ((input: PetBubbleOptions) => queue.show(input)) as PetBubbleHandle
    call.close = (id?: string) => queue.close(id)
    call.clear = () => queue.clear()
    handleRef.current = call
  }

  return { bubbles, handle: handleRef.current }
}
