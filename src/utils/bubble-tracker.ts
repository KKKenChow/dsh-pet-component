import type { PetBubble, PetBubbleOptions, PetBubblePlacement } from '../types/bubble'
import type { MotionInput, PetRenderMotion } from '../types/motion'
import {
  BUBBLE_MOTION_PRIORITY,
  createBubble,
  isTerminalMotion,
  MAX_VISIBLE_BUBBLES,
  motionKey,
  motionType,
  resolveBubbleTimeout,
  updateBubble,
} from './bubble'

/**
 * 会话气泡状态机 —— **移植**自 `source/deepseek-harness-desktop/src/pet/utils/bubble-tracker.ts`
 * （605 行）与 `src/utils/toast.ts` 的淘汰逻辑，把 HeroUI toast 换成组件自带的可见层。
 *
 * 参考实现是**两层**，这里保持同样的分层（之前自己发明的那版把两层揉在一起，
 * 于是「上限淘汰 / 超时收起」会连带把动作一起干掉）：
 *
 * | 层 | 参考实现 | 本文件 |
 * | --- | --- | --- |
 * | 状态登记处 | `sessions` / `previousStatus` / `dismissed` | 同名同义 |
 * | 可见层 | HeroUI `ToastQueue`（上限 `MAX_VISIBLE_TOASTS`、`scheduleHide` 独立收起） | `entries` / `order` |
 *
 * 两条动画通道（`statusOf` 只认第一条）：
 * - **常驻气泡**（`timeout === 0`）→ 参与聚合 → `<Pet motion>` 声明式驱动；
 * - **限时气泡**（`timeout > 0`）→ 不进聚合 → `Pet` 用 `pet.motion(...)` 播一次，动画自己播完，
 *   气泡超时收起也不会掐断它。所以这里**没有**脉冲窗口（早期照搬上游 `failedUntil` /
 *   `FAILED_PULSE_TTL` 的那套已删）。
 *
 * 其余性质：`dismissed`（收起过的终态档不被同档位重弹）、`STATUS_COALESCE_MS` 合并窗口
 * （多会话交错时不反复切回动画）。
 *
 * 纯逻辑（无 React、无 DOM）：定时器与时钟都可注入，单测直接驱动。
 */

type TimerHandle = ReturnType<typeof setTimeout>

/** 状态登记处里的一条：宿主最后一次下发的入参（参考实现的 `sessions` 值）。 */
type TrackedSession = PetBubbleOptions & { id: string }

export interface BubbleTrackerOptions {
  /** 聚合出的动作档位变化（`undefined` = 没有会话要驱动动作） */
  onMotion?: (motion: MotionInput | undefined) => void
  /** 可见气泡列表变化（每个 placement 最多 `maxVisible` 条） */
  onBubbles?: (bubbles: readonly PetBubble[]) => void
  /** 某条气泡创建时回调（仅创建一次） */
  onShow?: (bubble: PetBubble) => void
  /** 某条气泡原地更新时回调 */
  onUpdate?: (bubble: PetBubble, previous: PetBubble) => void
  /** 每个 placement 的同时可见上限（缺省 `MAX_VISIBLE_BUBBLES = 3`） */
  maxVisible?: number
  /** 注入定时器（单测用；缺省 `setTimeout`） */
  setTimer?: (handler: () => void, ms: number) => TimerHandle
  /** 注入清除定时器（单测用；缺省 `clearTimeout`） */
  clearTimer?: (handle: TimerHandle) => void
}

export interface BubbleTracker {
  /** 宿主下发一条气泡（同一 `id` = 原地更新），返回实际使用的 id */
  show: (options: PetBubbleOptions) => string
  /** 收起一条（缺省 = 最近一次创建/更新的那条），会话登记一并清除 */
  close: (id?: string) => void
  /** 清掉全部气泡与会话登记 */
  clear: () => void
  /** 释放所有定时器与可见层（会话登记保留，可在 StrictMode 双挂载间重复调用） */
  dispose: () => void
  readonly bubbles: readonly PetBubble[]
}

/**
 * 聚合状态下发合并窗口 ms（对齐参考实现的 `STATUS_COALESCE_MS`）。
 *
 * 多会话并行时每次更新都会重算聚合态，若每档都立即下发，渲染器会对逐个差异档位重载
 * 动画 —— 工作档位（thinking 20 / result 25 / working 30）交错抖动会让动画被反复切回。
 * 统一合并：窗内只刷新待下发值，到期一次性下发最新聚合态，中间档位全部丢弃。
 */
const STATUS_COALESCE_MS = 100

/** 会话完成后保留的时长 ms（对齐参考实现的 `IDLE_SESSION_RETENTION`）：防止会话表无界积累。 */
const IDLE_SESSION_RETENTION = 5000

export function createBubbleTracker(options: BubbleTrackerOptions = {}): BubbleTracker {
  const maxVisible = options.maxVisible ?? MAX_VISIBLE_BUBBLES
  const setTimer = options.setTimer ?? ((handler: () => void, ms: number) => setTimeout(handler, ms))
  const clearTimerFn = options.clearTimer ?? ((handle: TimerHandle) => clearTimeout(handle))

  /* ------------------------------ 状态登记处 ------------------------------ */

  const sessions = new Map<string, TrackedSession>()
  /** 会话 id → 上一次的动作档位指纹（`previousStatus`） */
  const previousStatus = new Map<string, string | undefined>()
  /** 已经收起过、且不应被同档位重建的会话（`dismissed`） */
  const dismissed = new Set<string>()

  /* -------------------------------- 可见层 -------------------------------- */

  /** 会话 id → 可见条目（参考实现的 toast） */
  const entries = new Map<string, PetBubble>()
  /** 每个 placement 的存活顺序（旧 → 新） */
  const order = new Map<PetBubblePlacement, string[]>()
  let visible: readonly PetBubble[] = []
  let createdSeq = 0
  let autoId = 0
  let touchedId: string | undefined

  /* -------------------------------- 定时器 -------------------------------- */

  const hideTimers = new Map<string, TimerHandle>()
  const pruneTimers = new Map<string, TimerHandle>()

  /* --------------------------------- 聚合 --------------------------------- */

  let lastAgg: MotionInput | undefined
  let pendingAgg: MotionInput | undefined
  let hasPendingAgg = false
  let aggFlushTimer: TimerHandle | undefined

  const clearTimer = (map: Map<string, TimerHandle>, id: string) => {
    const timer = map.get(id)
    if (timer !== undefined) {
      clearTimerFn(timer)
      map.delete(id)
    }
  }

  const syncVisible = () => {
    visible = [...entries.values()].sort((left, right) => left.created - right.created)
    options.onBubbles?.(visible)
  }

  /**
   * 关掉一条**可见**气泡：只动可见层，会话登记原样保留
   * （参考实现的 `closeToast`）—— 这正是「上限挤掉最旧之后动作还在」的原因。
   */
  const closeEntry = (id: string) => {
    clearTimer(hideTimers, id)
    const entry = entries.get(id)
    if (entry === undefined)
      return
    entries.delete(id)
    const keys = order.get(entry.placement)
    if (keys !== undefined) {
      const index = keys.indexOf(id)
      if (index >= 0)
        keys.splice(index, 1)
      if (keys.length === 0)
        order.delete(entry.placement)
    }
    syncVisible()
  }

  /** 超出上限就关最旧（移植 `toast.ts` 的 `placementOrder` 淘汰，逐条 `close`）。 */
  const evictOverflow = () => {
    order.forEach((keys, placement) => {
      while (keys.length > maxVisible) {
        const oldest = keys.shift()
        if (oldest !== undefined)
          closeEntry(oldest)
      }
      if (keys.length === 0)
        order.delete(placement)
    })
  }

  /**
   * 聚合出**常驻**气泡里优先级最高的档位（移植 `statusOf`）。
   *
   * 两条通道的分工（这是整个气泡动画模型的核心）：
   * - `timeout === 0` 的常驻气泡 → 参与聚合 → 由 `<Pet motion>` **声明式**驱动：状态在，动画就在；
   * - `timeout > 0` 的限时气泡 → **不参与聚合**（`Pet` 已经用 `pet.motion(...)` 让动画播一次），
   *   于是它的超时收起既不改 `motion` prop、也就不会把正在播的动画掐掉。
   */
  const statusOf = (): MotionInput | undefined => {
    let best: MotionInput | undefined
    let maxPriority = 0
    for (const session of sessions.values()) {
      const motion = session.motion
      if (motion === undefined || resolveBubbleTimeout(session) > 0)
        continue
      const priority = BUBBLE_MOTION_PRIORITY[motionType(motion) as PetRenderMotion] ?? 0
      if (priority > maxPriority) {
        maxPriority = priority
        best = motion
        if (maxPriority === BUBBLE_MOTION_PRIORITY.waiting)
          break // waiting 是最高优先级，提前收工
      }
    }
    return best
  }

  const flushPendingAgg = () => {
    aggFlushTimer = undefined
    if (!hasPendingAgg)
      return
    hasPendingAgg = false
    const next = pendingAgg
    if (motionKey(next) !== motionKey(lastAgg)) {
      lastAgg = next
      options.onMotion?.(next)
    }
  }

  const updateAgg = () => {
    const next = statusOf()
    if (motionKey(next) === motionKey(lastAgg) && !hasPendingAgg)
      return
    hasPendingAgg = true
    pendingAgg = next
    if (aggFlushTimer !== undefined)
      clearTimerFn(aggFlushTimer)
    // trailing 窗口：突发更新不断把窗口往后推，只收敛到最终聚合态下发一次
    aggFlushTimer = setTimer(flushPendingAgg, STATUS_COALESCE_MS)
  }

  const removeSession = (id: string) => {
    sessions.delete(id)
    previousStatus.delete(id)
    dismissed.delete(id)
    clearTimer(hideTimers, id)
    clearTimer(pruneTimers, id)
    closeEntry(id)
  }

  /**
   * 沉淀：隐藏后超过保留时间的**限时**会话彻底清掉。
   *
   * 常驻会话（`timeout: 0`）不沉淀 —— 它还在驱动 `motion` prop。
   */
  const pruneSession = (id: string) => {
    const session = sessions.get(id)
    if (session === undefined)
      return
    if (entries.has(id) || resolveBubbleTimeout(session) === 0)
      return
    removeSession(id)
    updateAgg()
  }

  /** 沉淀计时（移植 `armPrune`）：空闲会话超时后从会话表移除，避免无界积累。 */
  const armPrune = (id: string) => {
    clearTimer(pruneTimers, id)
    const timer = setTimer(() => {
      pruneTimers.delete(id)
      pruneSession(id)
    }, IDLE_SESSION_RETENTION)
    pruneTimers.set(id, timer)
  }

  /** 排自动收起计时器（移植 `scheduleHide`）：时长已按档位 / 显式 `timeout` 解析好。 */
  const scheduleHide = (id: string) => {
    clearTimer(hideTimers, id)
    const entry = entries.get(id)
    if (entry === undefined || entry.duration <= 0)
      return
    const timer = setTimer(() => {
      // 期间重排过（档位或时长变了）→ 交给新的计时器，这次不作数
      if (hideTimers.get(id) !== timer)
        return
      hideTimers.delete(id)
      if (!entries.has(id))
        return
      // 终态档收起后不再被「同一档位」重建（对齐参考实现：dismissed 只由终态档的 scheduleHide 打上）；
      // 显式 `timeout` 的通知气泡（非终态）收起后，宿主再推就该再出现
      if (isTerminalMotion(entry.motion))
        dismissed.add(id)
      closeEntry(id)
      armPrune(id)
    }, entry.duration)
    hideTimers.set(id, timer)
  }

  /** 可见层同步一条会话（移植 `syncToast`，内容由宿主给，不再从会话快照推导）。 */
  const syncBubble = (session: TrackedSession) => {
    const id = session.id
    const key = motionKey(session.motion)
    const seen = previousStatus.has(id)
    const previous = previousStatus.get(id)
    previousStatus.set(id, key)
    clearTimer(pruneTimers, id)

    const terminal = isTerminalMotion(session.motion)
    if (!terminal)
      dismissed.delete(id)

    const entry = entries.get(id)
    if (entry === undefined) {
      // 终态档自动收起过、且**档位没变** → 不再重建（对齐参考实现 `dismissed.has(id) || previous === current`
      // 里真正起作用的那一半）：同一档位重复上报不会把刚收起的气泡又弹回来；档位变了、
      // 或显式 `timeout` 的通知气泡（非终态、不登记 dismissed）再推，都照常出现。
      if (seen && dismissed.has(id) && previous === key)
        return
      const created = createBubble(session, id, ++createdSeq)
      entries.set(id, created)
      const keys = order.get(created.placement) ?? []
      keys.push(id)
      order.set(created.placement, keys)
      options.onShow?.(created)
      evictOverflow()
      syncVisible()
      // 有收起时长（终态档，或宿主显式给了 timeout）就排计时器
      if (created.duration > 0)
        scheduleHide(id)
      return
    }

    const next = updateBubble(entry, session)
    entries.set(id, next)
    options.onUpdate?.(next, entry)
    syncVisible()
    // 转入终态档、或收起时长变了（显式 timeout）才重排；纯文字更新不动计时器
    if (previous !== key || next.duration !== entry.duration) {
      if (next.duration > 0)
        scheduleHide(id)
      else
        clearTimer(hideTimers, id)
    }
  }

  const show = (options_: PetBubbleOptions): string => {
    const id = typeof options_.id === 'string' && options_.id !== ''
      ? options_.id
      : `dsh-pet-bubble-${++autoId}`
    touchedId = id
    const session: TrackedSession = { ...sessions.get(id), ...options_, id }
    // 宿主这次给了状态（`loading` / `motion`）却没给语义色 → 语义色跟着状态重算，**不继承**
    // 上一次的：否则「失败之后点加载」会带着 danger 回来（参考实现里 variant 本就是状态的派生量）。
    if (options_.variant === undefined && (options_.loading !== undefined || options_.motion !== undefined))
      session.variant = undefined
    sessions.set(id, session)
    syncBubble(session)
    updateAgg()
    return id
  }

  const close = (id?: string) => {
    const target = id ?? touchedId
    if (target === undefined)
      return
    removeSession(target)
    updateAgg()
  }

  const clear = () => {
    for (const id of [...sessions.keys()])
      removeSession(id)
    sessions.clear()
    entries.clear()
    order.clear()
    syncVisible()
    updateAgg()
  }

  const dispose = () => {
    // 幂等：只释放定时器与可见层，会话登记保留（StrictMode 的「挂载 → 释放 → 再挂载」下
    // 第二次释放是空操作，状态机本身仍可继续接收 show/close）
    for (const map of [hideTimers, pruneTimers]) {
      map.forEach(timer => clearTimerFn(timer))
      map.clear()
    }
    if (aggFlushTimer !== undefined) {
      clearTimerFn(aggFlushTimer)
      aggFlushTimer = undefined
    }
    hasPendingAgg = false
    entries.clear()
    order.clear()
    syncVisible()
  }

  return {
    show,
    close,
    clear,
    dispose,
    get bubbles(): readonly PetBubble[] {
      return visible
    },
  }
}
