import type { UseDraggableOptions } from '@reaxuse/core'
import type { RefObject } from 'react'
import { useDraggable } from '@reaxuse/core'
import { useCallback, useRef, useState } from 'react'

/** 拖拽的水平方向。 */
export type DragDirection = 'left' | 'right'

/** 判定「真正开始拖拽」的累计位移阈值（px）——与 dsh-pet 的 `DRAG_THRESHOLD` 同量级。 */
const DRAG_START_THRESHOLD = 8

/** 判定方向的水平位移阈值（px），滤除拖拽起步的抖动。 */
const DRAG_DIRECTION_THRESHOLD = 3

/** 双击判定窗口（ms）：两次按下间隔小于它且期间未拖拽 = 双击 → 点击回应。 */
const DOUBLE_CLICK_MS = 500

export interface PetDragOptions {
  /**
   * 拖动边界容器（通常是舞台）：给了它 `useDraggable` 会把位置夹在容器内，
   * 宠物不会被拖出舞台。
   */
  containerRef?: RefObject<HTMLElement | null>
  /** 双击（两次按下 < 500ms 且期间未拖拽）时回调 —— 驱动点击回应动画 */
  onDoubleClick?: () => void
}

export interface PetDragResult {
  /** 绑到拖拽容器的 ref（`useDraggable` 的 target：被移动的元素） */
  boxRef: RefObject<HTMLDivElement | null>
  /** 绑到组件 `hitboxRef`（`useDraggable` 的 handle：只有命中箱能起拖） */
  handleRef: RefObject<HTMLDivElement | null>
  /** 位置（来自 `useDraggable` 的 `x` / `y`） */
  x: number
  y: number
  /**
   * 拖动会话进行中。**超过位移阈值才为 true**（与参考实现一致）：单击/抖动不算拖拽，
   * 不会播放「被抓起」动画。组件把它接到 `dragging` prop 上。
   */
  dragging: boolean
  /** 当前拖动方向；未拖动 / 位移不足时为 `undefined` */
  direction: DragDirection | undefined
  /** 命中箱按下会话进行中（单击也包含），用于按下反馈 */
  pressed: boolean
  /** 命中箱的 pointerdown（接到组件的 `onHitboxPointerDown`） */
  onHitboxPointerDown: () => void
  onHitboxPointerUp: () => void
  reset: () => void
}

/**
 * Playground 的宠物拖拽 —— 机械部分交给 reaxuse 的 `useDraggable`
 * （VueUse `useDraggable` 的 React 移植：target 被移动、handle 起拖、
 * draggingElement 收 `pointermove` / `pointerup`），这里只补两件它不管的手势语义：
 *
 * 1. **位移阈值**：`useDraggable` 在 `pointerdown` 就进入拖动态，而桌宠要求累计位移
 *    超过阈值才算拖动（单击不播「被抓起」动画，与 dsh-pet / deepseek-harness-desktop 一致）；
 * 2. **方向采样 + 双击判定**：逐次 `dx` 过阈值才更新方向；两次按下 < 500ms 且期间没拖过
 *    算双击 → 点击回应。
 *
 * 手势结果（`dragging` / `direction`）不掺协议：dsh-pet 用它播 `animations.drag` 的悬浮，
 * Codex 用它播左右行走行。
 */
export function usePetDrag(options: PetDragOptions = {}): PetDragResult {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)

  const [dragging, setDragging] = useState(false)
  const [direction, setDirection] = useState<DragDirection | undefined>(undefined)
  const [pressed, setPressed] = useState(false)

  const onDoubleClickRef = useRef(options.onDoubleClick)
  onDoubleClickRef.current = options.onDoubleClick

  /** 上次会话是否真的拖动过（决定下一次快速按下算不算双击） */
  const engagedRef = useRef(false)
  const draggingRef = useRef(false)
  const startRef = useRef<{ x: number, y: number } | null>(null)
  const lastXRef = useRef<number | undefined>(undefined)
  const lastDownRef = useRef<number | undefined>(undefined)

  const onStart: UseDraggableOptions['onStart'] = useCallback((position) => {
    // 双击判定要读到「自上次按下以来是否拖拽过」，所以先判定、再重置本次会话
    const now = performance.now()
    const isDoubleClick = lastDownRef.current !== undefined
      && now - lastDownRef.current < DOUBLE_CLICK_MS
      && engagedRef.current === false
    lastDownRef.current = now

    engagedRef.current = false
    draggingRef.current = false
    startRef.current = { x: position.x, y: position.y }
    lastXRef.current = undefined
    setDragging(false)
    setDirection(undefined)
    setPressed(true)

    if (isDoubleClick)
      onDoubleClickRef.current?.()
  }, [])

  const onMove: UseDraggableOptions['onMove'] = useCallback((position) => {
    const start = startRef.current
    if (start === null)
      return

    // 未达阈值：单击 / 双击 / 抖动都不算拖拽
    if (!engagedRef.current) {
      if (Math.hypot(position.x - start.x, position.y - start.y) < DRAG_START_THRESHOLD)
        return
      engagedRef.current = true
      draggingRef.current = true
      setDragging(true)
      lastXRef.current = position.x
      return
    }

    const lastX = lastXRef.current
    lastXRef.current = position.x
    if (lastX === undefined)
      return
    const stepX = position.x - lastX
    if (Math.abs(stepX) >= DRAG_DIRECTION_THRESHOLD)
      setDirection(stepX > 0 ? 'right' : 'left')
  }, [])

  const onEnd: UseDraggableOptions['onEnd'] = useCallback(() => {
    draggingRef.current = false
    startRef.current = null
    lastXRef.current = undefined
    setDragging(false)
    setDirection(undefined)
    setPressed(false)
  }, [])

  const { x, y, setX, setY } = useDraggable(boxRef, {
    handle: handleRef,
    // 给了容器就夹在容器内（`useDraggable` 的 restrictInView 语义），宠物不会被拖出舞台
    containerElement: options.containerRef,
    initialValue: { x: 0, y: 0 },
    onStart,
    onMove,
    onEnd,
  })

  const onHitboxPointerDown = useCallback(() => setPressed(true), [])
  const onHitboxPointerUp = useCallback(() => setPressed(false), [])

  const reset = useCallback(() => {
    setX(0)
    setY(0)
  }, [setX, setY])

  return {
    boxRef,
    handleRef,
    x,
    y,
    dragging,
    direction,
    pressed,
    onHitboxPointerDown,
    onHitboxPointerUp,
    reset,
  }
}
