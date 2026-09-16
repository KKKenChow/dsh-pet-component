import type { PetBubble, PetBubbleOptions, PetBubbleVariant } from '../types/bubble'
import type { MotionInput } from '../types/motion'
import { isLoopingMotion } from '../config'
import { normalizeMotionInput } from '../types/motion'

/**
 * 气泡的纯逻辑层（与队列容器 `createBubbleQueue` 分开：这里没有定时器，可单测）。
 *
 * 三个默认时长与「同时可见上限」逐值对齐 `source/deepseek-harness-desktop`
 * 的桌宠气泡（`src/pet/utils/bubble-tracker.ts` 的 `FAILED_BUBBLE_TIMEOUT` /
 * `REVIEW_BUBBLE_TIMEOUT` / `SUCCESS_TOAST_TIMEOUT`，`src/utils/toast.ts` 的
 * `MAX_VISIBLE_TOASTS`）—— 同一套观感语义，只是从 HeroUI toast 换成组件自带的气泡层。
 */

/** 各语义色的默认自动收起时长 ms（`0` = 常驻，由业务显式 `close`）。 */
export const BUBBLE_DEFAULT_TIMEOUT: Record<PetBubbleVariant, number> = {
  default: 0,
  success: 3000,
  warning: 2500,
  danger: 4000,
}

/** 同时可见上限：超出即关最旧（对齐 desktop `MAX_VISIBLE_TOASTS = 3` 与它的淘汰逻辑）。 */
export const MAX_VISIBLE_BUBBLES = 3

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
    restore: options.restore === true,
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
 * - 布尔与节点字段给了才改（`undefined` = 保持原值）；
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
    restore: options.restore ?? previous.restore,
    placement: options.placement ?? previous.placement,
    duration: resolveUpdatedDuration(previous, options, variant),
  }
}

/**
 * 原地更新时的时长规则：
 *
 * 1. 显式给 `timeout` → 按它重算（`0` = 改回常驻）；
 * 2. 没给但**语义色变了** → 按新语义色的默认时长重算 —— 否则「加载态（`default`，常驻）
 *    原地更新为完成（`success`）」会永远挂在画面上不消失；
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
 * 原地更新后需要**重新下发**的捆绑动画（不需要则返回 `undefined`）。
 *
 * 比较的是**语义状态**而不是入参形状：`'thinking'` 与 `{ type: 'thinking' }` 等价
 * （用 `normalizeMotionInput` + `isLoopingMotion` 归一），`replay` 不参与比较（它是
 * 「强制重播」的开关，不是状态）。这样宿主每次传新对象字面量不会重播动画，而
 * `loading: true → false` 这种真正换了档位的更新一定会重发 —— 否则画面会停在加载态的动作上。
 */
export function resolveBubbleMotion(next: PetBubble, previous: PetBubble): MotionInput | undefined {
  if (next.motion === undefined)
    return undefined
  if (previous.motion !== undefined && motionStateKey(next.motion) === motionStateKey(previous.motion))
    return undefined
  return next.motion
}

/** 动作的语义状态指纹（动作名 + 归一后的循环语义；忽略 `replay`）。 */
function motionStateKey(input: MotionInput): string {
  const type = typeof input === 'string' ? input : input.type
  const normalized = normalizeMotionInput(input, isLoopingMotion(type))
  return `${normalized.type}:${normalized.loop ? '1' : '0'}`
}

/**
 * 这条气泡下发的动作是不是**循环**动作（`thinking` / `working` / `running` / `waiting` …）。
 *
 * 循环动作不会自己结束，所以「气泡收起 + 没有别的气泡接手」时必须 `clear()` 回落，否则宠物
 * 会一直播下去；一次性动作（`success` / `error` / 风味动作）相反 —— 让它自己播完再回落，
 * 才不会把动画掐半截。
 */
export function isLoopingBubbleMotion(input: MotionInput | undefined): boolean {
  if (input === undefined)
    return false
  return isLoopingMotion(typeof input === 'string' ? input : input.type)
}

/**
 * 从队列里挑出**最新的那条带捆绑动画的气泡** —— 某条气泡收起时把动作交还给谁。
 *
 * 队列是「旧 → 新」的顺序，而最新的一条在层叠里最靠前（`--front`），所以它才是动作的主人；
 * 从后往前扫第一个命中即可（`excludeId` 用来跳过正在收起的那条）。
 */
export function newestMotionBubble(
  bubbles: readonly PetBubble[],
  excludeId?: string,
): PetBubble | undefined {
  for (let index = bubbles.length - 1; index >= 0; index -= 1) {
    const bubble = bubbles[index]
    if (bubble === undefined || bubble.id === excludeId || bubble.motion === undefined)
      continue
    return bubble
  }
  return undefined
}
