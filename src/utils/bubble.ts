import type { PetBubble, PetBubbleOptions, PetBubbleVariant } from '../types/bubble'
import type { MotionInput, PetRenderMotion } from '../types/motion'

/**
 * 气泡的**纯逻辑层**：常量、档位判定、单条条目的补齐与原地更新。
 *
 * 定时器、状态登记处与聚合在 `bubble-tracker.ts`（移植自参考实现）。这里的一切逐值
 * 对齐 `source/deepseek-harness-desktop`：
 *
 * | 本文件 | 参考实现 |
 * | --- | --- |
 * | `MAX_VISIBLE_BUBBLES` | `src/utils/toast.ts` 的 `MAX_VISIBLE_TOASTS` |
 * | `BUBBLE_TERMINAL_TIMEOUT` | `src/pet/utils/bubble-tracker.ts` 的 `scheduleHide` |
 * | `BUBBLE_MOTION_PRIORITY` | 同文件的 `STATUS_PRIORITY` |
 */

/** 同时可见上限：超出即关最旧（对齐 `MAX_VISIBLE_TOASTS = 3` 与它的淘汰逻辑）。 */
export const MAX_VISIBLE_BUBBLES = 3

/**
 * **终态档**的自动收起时长 ms（对齐参考实现的 `scheduleHide`）：
 * `failed` / `error` 4000、`review` 2500、`success` 3000；其余档位不在表里 = 常驻，
 * 等状态自己变化（工作档位、等待档都是这样）。
 *
 * 注意：**只有终态档才排计时器** —— 这正是「更新为警告（等待档）不该自动消失」的根据。
 */
export const BUBBLE_TERMINAL_TIMEOUT: Partial<Record<PetRenderMotion, number>> = {
  failed: 4000,
  error: 4000,
  review: 2500,
  success: 3000,
}

/* 注：**没有**「终态档聚合保持窗口」这种东西。限时气泡（`timeout > 0`）根本不参与声明式聚合，
 * 它的动画由 `Pet` 用 `pet.motion(...)` 播一次、自己播完（见 `pet.tsx`）；参与聚合的只有常驻
 * 气泡（`timeout: 0`）。早期照搬上游 `FAILED_PULSE_TTL` / `TERMINAL_PULSE_TTL` 的那套窗口
 * 已经被删掉 —— 它的作用就是用聚合态去掐/留动画，而正解是让命令面的动画自己结束。 */

/**
 * 聚合优先级（对齐 `STATUS_PRIORITY`）：数值越大越优先，同档取先登记的会话。
 *
 * `dragging` 是手势态、正常不会出现在气泡上，给个中间值只是为了「真有人这么传」时
 * 行为可预期；`waving` / `turn` / `moving-*` / `idle` 为 0 = 不驱动动作
 * （与参考实现一致：0 档等于「没有会话状态」）。
 */
export const BUBBLE_MOTION_PRIORITY: Record<PetRenderMotion, number> = {
  'waiting': 60,
  'error': 50,
  'failed': 45,
  'review': 40,
  'dragging': 35,
  'working': 30,
  'result': 25,
  'thinking': 20,
  'running': 12,
  'success': 10,
  'waving': 0,
  'turn': 0,
  'moving-left': 0,
  'moving-right': 0,
  'idle': 0,
}

/**
 * 会「自己收起 + 需要多留一会儿」的档位（参考实现的 `isTerminal`）：
 * `failed` / `review` / `error` / `success`。
 */
const TERMINAL_MOTIONS: readonly PetRenderMotion[] = ['failed', 'review', 'error', 'success']

/** 归一化动作入参到动作名（去掉 `{ type, loop, replay }` 这层形状）。 */
export function motionType(input: MotionInput | undefined): PetRenderMotion | undefined {
  if (input === undefined)
    return undefined
  return typeof input === 'string' ? input : input.type
}

/**
 * 动作的语义指纹（动作名 + 归一后的循环语义；忽略 `replay`）。
 *
 * 用它比较「档位变没变」：`'thinking'` 与 `{ type: 'thinking' }` 等价，宿主每次传新
 * 对象字面量也不会被当成换档。
 */
export function motionKey(input: MotionInput | undefined): string | undefined {
  if (input === undefined)
    return undefined
  if (typeof input === 'string')
    return input
  return input.loop === undefined ? input.type : `${input.type}:${String(input.loop)}`
}

/** 是不是终态档（会自己收起、需要多留一会儿）。 */
export function isTerminalMotion(input: MotionInput | undefined): boolean {
  const type = motionType(input)
  return type !== undefined && TERMINAL_MOTIONS.includes(type)
}

/** 终态档的自动收起时长；非终态（含未给动作）返回 `undefined` = 常驻。 */
export function terminalTimeoutOf(input: MotionInput | undefined): number | undefined {
  const type = motionType(input)
  return type === undefined ? undefined : BUBBLE_TERMINAL_TIMEOUT[type]
}

/**
 * 解析自动收起时长：
 *
 * 1. 宿主显式给了 `timeout` → 用它（非正数 / 非数字一律当 `0` 常驻，不猜一个随机时长）；
 * 2. 否则按**动作档位**（= 状态，参考实现里 variant 也是由状态推导的，所以这里不看
 *    `variant`）取终态档时长；
 * 3. 都不成立 → `0`（常驻）。
 *
 * 这个时长同时决定气泡走哪条动画通道（见 `pet.tsx`）：`0` → 声明式 `motion` prop；
 * `> 0` → 命令面 `pet.motion(...)` 播一次。
 */
export function resolveBubbleTimeout(input: { motion?: MotionInput, timeout?: number }): number {
  if (input.timeout !== undefined)
    return Number.isFinite(input.timeout) && input.timeout > 0 ? input.timeout : 0
  return terminalTimeoutOf(input.motion) ?? 0
}

/**
 * 档位 → 默认语义色（参考实现 `toastContent` 里 `variant` 就是状态的派生量，这里反过来用）：
 * `waiting` / `review` → warning、`failed` / `error` → danger、`success` → success、
 * 其余工作档（thinking / working / result / running）→ default；空闲类档位没有状态 → `undefined`。
 *
 * 有了它，「只换了状态、没给语义色」也能自动落到对应颜色（加载态 → Info、完成 → success），
 * 不会把上一条的 danger 一路继承下去。
 */
export function variantOfMotion(input: MotionInput | undefined): PetBubbleVariant | undefined {
  const type = motionType(input)
  if (type === undefined)
    return undefined
  if (type === 'waiting' || type === 'review')
    return 'warning'
  if (type === 'failed' || type === 'error')
    return 'danger'
  if (type === 'success')
    return 'success'
  if (type === 'idle' || type === 'turn' || type === 'waving' || type === 'moving-left' || type === 'moving-right' || type === 'dragging')
    return undefined
  return 'default'
}

/**
 * 语义色：显式给的优先；否则**加载态一律是 `default`（Info）**；再否则用调用方按状态算出的
 * 默认色（见 `variantOfMotion`）。
 *
 * 对齐参考实现的 `toastContent`：`isLoading` 只出现在 `running` / `thinking` /
 * `working` / `result` 这几档，而它们的 `variant` 全是 `default`。所以「更新为警告后
 * 再点加载态」必须回到 Info，而不是带着 warning（否则会按 review 的时长自己消失）。
 */
export function resolveBubbleVariant(
  loading: boolean,
  explicit: PetBubbleVariant | undefined,
  fallback: PetBubbleVariant,
): PetBubbleVariant {
  if (explicit !== undefined)
    return explicit
  return loading ? 'default' : fallback
}

/** 补齐默认值，生成一条入队气泡。 */
export function createBubble(options: PetBubbleOptions, id: string, created: number): PetBubble {
  const loading = options.loading === true
  return {
    id,
    title: options.title,
    description: options.description,
    icon: options.icon,
    image: options.image,
    loading,
    variant: resolveBubbleVariant(loading, options.variant, variantOfMotion(options.motion) ?? 'default'),
    motion: options.motion,
    placement: options.placement ?? 'top',
    kind: options.kind ?? 'bubble',
    duration: resolveBubbleTimeout({ motion: options.motion, timeout: options.timeout }),
    created,
  }
}

/**
 * 原地更新一条气泡：只换**本次显式给出**的字段（`id` / `created` 不变），等价于参考
 * 实现的 `toast.update(key, content)`。
 *
 * 时长重算规则（对应参考实现「只在**转入**终态档时 `scheduleHide`」）：
 * 1. 显式给 `timeout` → 按它重算；
 * 2. 没给但**动作档位变了** → 按新档位重算（于是「加载态 → 完成」会 3s 后自己收，
 *    而「更新为警告（等待档）」不会莫名开始倒计时）；
 * 3. 都没变 → 保持原时长，所以「原地换文字」不会重置自动收起。
 */
export function updateBubble(previous: PetBubble, options: PetBubbleOptions): PetBubble {
  // 「显式 `undefined` = 清除」：与 `createBubbleTracker.show()` 的会话快照合并（spread）
  // 保持同一套语义，于是 `pet.muttering(text, { image: undefined })` 能真的把配图清掉。
  const merged = { ...previous, ...options }
  const loading = merged.loading === true
  const motion = merged.motion
  return {
    ...merged,
    id: previous.id,
    created: previous.created,
    loading,
    // 本次给了状态（motion）就按状态重算语义色，否则保留上一条的
    variant: resolveBubbleVariant(loading, options.variant, variantOfMotion(motion) ?? previous.variant),
    placement: merged.placement ?? previous.placement,
    kind: merged.kind ?? previous.kind,
    duration: resolveUpdatedDuration(previous, options, motion),
  }
}

function resolveUpdatedDuration(previous: PetBubble, options: PetBubbleOptions, motion: MotionInput | undefined): number {
  if (options.timeout !== undefined)
    return resolveBubbleTimeout({ timeout: options.timeout })
  if (motionKey(motion) !== motionKey(previous.motion))
    return resolveBubbleTimeout({ motion })
  return previous.duration
}
