import type { PetBubble, PetBubbleOptions, PetBubbleVariant } from '../types/bubble'
import type { MotionInput, PetRenderMotion } from '../types/motion'

/**
 * 气泡的纯逻辑层（与队列容器 `createBubbleQueue` 分开：这里没有定时器，可单测）。
 *
 * 全部规则都对着 `source/deepseek-harness-desktop` 的桌宠气泡抄：
 * - 超时只给**终态**档排计时器 → `BUBBLE_DEFAULT_TIMEOUT`（对应 `bubble-tracker.ts`
 *   的 `scheduleHide`：`FAILED_BUBBLE_TIMEOUT` / `REVIEW_BUBBLE_TIMEOUT` /
 *   `SUCCESS_TOAST_TIMEOUT`）；
 * - 同时可见上限 → `MAX_VISIBLE_BUBBLES`（对应 `utils/toast.ts` 的 `MAX_VISIBLE_TOASTS`）；
 * - 多气泡聚合出的动作 → `aggregateBubbleMotion`（对应 `bubble-tracker.ts` 的
 *   `STATUS_PRIORITY` + `statusOf`）。
 */

/**
 * 各语义色的默认自动收起时长 ms（`0` = 常驻，等状态自己变化）。
 *
 * 表按参考实现的 `scheduleHide` 反推 —— **只有终态档才排收起计时器**：
 *
 * | 语义色 | 参考实现里的状态 | 时长 |
 * | --- | --- | --- |
 * | `success` | `success`（已完成） | 3000 |
 * | `danger` | `failed` / `error`（失败 / 出错） | 4000 |
 * | `warning` | `waiting`（等待，优先级 60 的常驻档） | 0 |
 * | `default` | `running` / `thinking` / `working` / `result` | 0 |
 *
 * 参考实现里唯一带计时器的 warning 是 `review`（`REVIEW_BUBBLE_TIMEOUT = 2500`）：
 * 需要「待审阅、过一会儿自己收」的语义时，显式传 `timeout: 2500`。
 */
export const BUBBLE_DEFAULT_TIMEOUT: Record<PetBubbleVariant, number> = {
  default: 0,
  success: 3000,
  warning: 0,
  danger: 4000,
}

/** 同时可见上限：超出即关最旧（对齐 desktop `MAX_VISIBLE_TOASTS = 3` 与它的淘汰逻辑）。 */
export const MAX_VISIBLE_BUBBLES = 3

/**
 * 聚合优先级表 —— 与 `bubble-tracker.ts` 的 `STATUS_PRIORITY` 逐值一致
 * （等待 60 > 出错 50 > 失败 45 > 待审阅 40 > 工作中 30 > 整理中 25 > 思考中 20 >
 * 运行中 12 > 完成 10 > 空闲 0）。`dragging` 是手势态、正常不会出现在气泡上，
 * 给个中间值只是为了「真有人这么传」时行为可预期。
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
 * 解析自动收起时长。
 *
 * 显式 `timeout` 优先：非正数 / 非数字一律当 `0`（常驻）—— 与 dsh-pet 对
 * `eventsRefreshSec` 非法值的处置同思路：不猜、不兜成随机时长。
 */
export function resolveBubbleTimeout(variant: PetBubbleVariant, timeout?: number): number {
  if (timeout !== undefined)
    return Number.isFinite(timeout) && timeout > 0 ? timeout : 0
  return BUBBLE_DEFAULT_TIMEOUT[variant]
}

/** 补齐默认值，生成一条入队气泡。 */
export function createBubble(options: PetBubbleOptions, id: string, created: number): PetBubble {
  const variant = options.variant ?? 'default'
  return {
    id,
    title: options.title,
    description: options.description,
    icon: options.icon,
    image: options.image,
    loading: options.loading === true,
    variant,
    motion: options.motion,
    placement: options.placement ?? 'top',
    kind: options.kind ?? 'bubble',
    duration: resolveBubbleTimeout(variant, options.timeout),
    created,
  }
}

/**
 * 原地更新一条气泡：只换**本次显式给出**的字段。
 *
 * - `id` / `created` 恒定不变（排序与稳定 key 不因为更新而变）；
 * - 字段给了才改（`undefined` = 保持原值）；
 * - `timeout` **只有显式给**才重算时长并重排计时 —— 这就是「可更新文字」不打断
 *   自动收起的原因，与 desktop `toast.update(key, content)` 的原地更新同义。
 */
export function updateBubble(previous: PetBubble, options: PetBubbleOptions): PetBubble {
  const variant = options.variant ?? previous.variant
  return {
    ...previous,
    title: options.title ?? previous.title,
    description: options.description ?? previous.description,
    icon: options.icon ?? previous.icon,
    image: options.image ?? previous.image,
    loading: options.loading ?? previous.loading,
    variant,
    motion: options.motion ?? previous.motion,
    placement: options.placement ?? previous.placement,
    duration: resolveUpdatedDuration(previous, options, variant),
  }
}

/**
 * 原地更新时的时长规则（对应参考实现的 `scheduleHide`：**转入**终态档才排计时器）：
 *
 * 1. 显式给 `timeout` → 按它重算（`0` = 改回常驻）；
 * 2. 没给但**语义色变了** → 按新语义色的默认时长重算 —— 「加载态（`default`，常驻）
 *    原地更新为完成（`success`）」因此会在 3s 后自己收；而更新为 `warning`（等待档，
 *    默认常驻）不会莫名其妙开始倒计时；
 * 3. 两者都没有 → 保持原时长，所以「原地换文字」不会重置自动收起。
 */
function resolveUpdatedDuration(previous: PetBubble, options: PetBubbleOptions, variant: PetBubbleVariant): number {
  if (options.timeout !== undefined)
    return resolveBubbleTimeout(variant, options.timeout)
  if (variant !== previous.variant)
    return resolveBubbleTimeout(variant)
  return previous.duration
}

/**
 * 多气泡**聚合**出的动作（`undefined` = 没有气泡要驱动动作，回落 `motion` prop）。
 *
 * 取优先级最高的一条 —— 表见 `BUBBLE_MOTION_PRIORITY`，与参考实现的 `statusOf`
 * 同表同规则（`>` 比较，所以同档位取先入队的那条）。聚合规则放在组件里，宿主就
 * 不必自己算「哪条气泡该驱动动画」：把每条会话的状态灌进 `pet.bubble({ id, motion })`
 * 即可，多会话并发时的优先级由这里统一决定。
 */
export function aggregateBubbleMotion(bubbles: readonly PetBubble[]): MotionInput | undefined {
  let best: MotionInput | undefined
  let bestPriority = -1
  for (const bubble of bubbles) {
    if (bubble.motion === undefined)
      continue
    const type = typeof bubble.motion === 'string' ? bubble.motion : bubble.motion.type
    const priority = BUBBLE_MOTION_PRIORITY[type] ?? 0
    if (priority > bestPriority) {
      bestPriority = priority
      best = bubble.motion
    }
  }
  return best
}
