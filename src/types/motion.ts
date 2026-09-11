/**
 * 桌宠动作（Motion）—— 组件对外唯一的「播放意图」语言。
 *
 * 与参考实现（`source/deepseek-harness-desktop/src/pet/hooks/use-pet.ts` 的
 * `PET_STATUSES`、`source/dsh-pet` 的 `workStatus` 档位）完全同构：
 *
 * - 基础姿态：`idle` / `turn` / `moving-left` / `moving-right` / `waving`
 * - 细分工作档位（对齐 dsh-pet `animations.events.workStatus` 的索引顺序）：
 *   `thinking`(0) / `working`(1) / `result`(2) / `waiting`(3) / `success`(4) / `error`(5)
 * - 旧粗态兼容：`running`（干活）/ `review`（整理）/ `failed`（出错）
 *
 * 命名一律使用连字符小写，`Motion` 是唯一事实来源：新增档位只需改 `MOTIONS`。
 */

/** 全部动作（顺序 = `MOTIONS` 的规范化顺序，也是 workStatus 档位顺序的基础）。 */
export const MOTIONS = [
  'idle',
  'turn',
  'moving-left',
  'moving-right',
  'waving',
  'thinking',
  'working',
  'result',
  'waiting',
  'running',
  'review',
  'failed',
  'success',
  'error',
] as const

/** 当前播放的动作。默认 `idle`。 */
export type Motion = (typeof MOTIONS)[number]

/**
 * 一次动作下发的完整描述。
 *
 * @example
 * pet.motion({ type: 'thinking', loop: true }) // 思考动作，循环播放
 * pet.motion({ type: 'result' })               // 结果动作，播一次后回 idle
 * pet.motion({ type: 'dragging' })             // 手势态：被抓起悬空（dsh-pet 取 drag 池）
 */
export interface MotionOptions {
  /** 目标动作（含手势态 `dragging`） */
  type: PetRenderMotion
  /**
   * 是否循环播放。缺省按动作语义决定（`idle`/`working`/`thinking` 等常驻档循环，
   * `waving`/`success`/`error` 等一次性档播完回落 `idle`）——见 `isLoopingMotion`。
   */
  loop?: boolean
  /**
   * 强制重播：同一个动作重复下发时，默认不重新开始播放（避免「同一条状态重复到达 →
   * 动画一直从头播」的抖动）。置 `true` 表示用户确实想再看一次。
   */
  replay?: boolean
}

/** `Motion` 的宽松入参：可以只给动作名。 */
export type MotionInput = PetRenderMotion | MotionOptions

/**
 * 渲染层动作 = 对外的 14 个 `Motion` + 一个**手势态** `dragging`。
 *
 * 拖拽不是会话状态而是手势态（参考实现里 `dragging` 同样不进 `PET_STATUSES`，
 * 只作组件的一个独立 prop），所以它不进入 `Motion` 联合，但两层渲染器都要为它
 * 准备各自的资源：
 * - dsh-pet：`animations.drag` 池（「被无形抓起悬空」的姿势），**不使用** `moves` 池
 *   （`moves` 是自动漫游用的，本组件不驱动漫游）；
 * - Codex：按方向落到 `movingLeft` / `movingRight` 行（图集没有专门的拖拽行）。
 */
export type PetRenderMotion = Motion | 'dragging'

/** 动作名 → 是否为已知动作。 */
export function isMotion(value: unknown): value is Motion {
  return typeof value === 'string' && (MOTIONS as readonly string[]).includes(value)
}

/**
 * 打平成 `Required<MotionOptions>`：`loop` 缺省时按动作自身语义补齐，`replay` 缺省 `false`。
 *
 * 只做形状转换，循环语义来自 `src/config` 的 `isLoopingMotion`（纯逻辑层唯一来源），
 * 这里通过注入的 `loop` 参数避免 `types` → `config` 的反向依赖。
 */
export function normalizeMotionInput(input: MotionInput, loop: boolean): Required<MotionOptions> {
  if (typeof input === 'string')
    return { type: input, loop, replay: false }
  return { type: input.type, loop: input.loop ?? loop, replay: input.replay === true }
}

/**
 * 动作入参的稳定指纹：`motion` prop 变化检测用（`MotionOptions` 对象字面量每次渲染
 * 都是新引用，直接比较引用会导致无限回写）。
 */
export function motionInputKey(input: MotionInput | undefined): string {
  if (input === undefined)
    return ''
  if (typeof input === 'string')
    return input
  return `${input.type}:${input.loop === undefined ? '' : input.loop ? '1' : '0'}:${input.replay === true ? '1' : '0'}`
}
