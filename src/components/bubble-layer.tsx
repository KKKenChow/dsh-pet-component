import type { PetBubble, PetBubblePlacement, PetBubbleVariant } from '../types'
import { CircleCheck, CircleExclamation, CircleInfo, TriangleExclamation } from '@gravity-ui/icons'
import { BubbleSpinner } from './bubble-icons'

/**
 * 气泡叠加层（内部组件）—— 由 `Pet` 挂在自套的 `.dsh-pet-shell` 里。
 *
 * 观感逐项对齐 `source/deepseek-harness-desktop` 的会话 toast（HeroUI `Toast` +
 * 它的 `Toast.Indicator` / `Toast.Content`）：
 *
 * | 维度 | 对齐来源 |
 * | --- | --- |
 * | 字号 / 行高 / 圆角 / 内外边距 / 两行截断 | `@heroui/styles/dist/components/toast.css`（见 `src/styles.ts`） |
 * | 默认图标 | `@gravity-ui/icons`（desktop 全程用的同一批：`CircleInfo` / `CircleCheck` / …） |
 * | 加载态 | HeroUI `Spinner`（desktop 在 `isLoading` 时就是它） |
 * | 层叠（scale / 间距 / 裁剪 / z-index） | `components/toast/toast.js` + `constants.js` |
 *
 * 三条队列规则：最新的一条在最前（完整尺寸、`--front`），更旧的按 index 缩小并按 HeroUI 的方向
 * 偏移（`top` 区往下叠、`bottom` 区往上叠）；非最前的高度取最前那条并裁剪，所以只露出一条边；
 * 元素按需挂载/卸载（淡入只给最前那条）。没有尾巴 —— desktop 的 toast 是纯圆角矩形。
 */

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/** 层叠缩放系数（HeroUI `components/toast/constants.js` 的 `DEFAULT_SCALE_FACTOR`）。 */
const STACK_SCALE_FACTOR = 0.05

/**
 * 语义色 → 默认图标：**直接从 `@gravity-ui/icons` 取**（desktop 全项目用的就是这一批），
 * 与 HeroUI toast 的默认图标（`InfoIcon` / `SuccessIcon` / `WarningIcon` / `DangerIcon`）同源，
 * 所以不需要再手抄 SVG 路径。尺寸与颜色由 `src/styles.ts` 的图标槽规则决定。
 */
const BUBBLE_ICONS: Record<PetBubbleVariant, typeof CircleInfo> = {
  default: CircleInfo,
  success: CircleCheck,
  warning: TriangleExclamation,
  danger: CircleExclamation,
}

/** 图标槽：碎碎念不占图标位；其余为 显式 `icon` > 加载圆环 > 语义色默认图标。 */
function BubbleIndicator({ bubble }: { bubble: PetBubble }) {
  // 碎碎念是「说话」而不是状态：只有正文，没有图标（对齐 dsh-pet 的白气泡）
  if (bubble.kind === 'muttering')
    return null
  if (bubble.icon != null)
    return <span className="dsh-pet__bubble-indicator">{bubble.icon}</span>
  if (bubble.loading)
    return <span className="dsh-pet__bubble-indicator"><BubbleSpinner /></span>
  const Icon = BUBBLE_ICONS[bubble.variant]
  return <span className="dsh-pet__bubble-indicator"><Icon /></span>
}

function PetBubbleItem({ bubble }: { bubble: PetBubble }) {
  const image = typeof bubble.image === 'string' && bubble.image !== '' ? bubble.image : undefined
  const hasTitle = bubble.title != null && bubble.title !== ''
  const hasText = bubble.description != null && bubble.description !== ''

  return (
    <>
      <BubbleIndicator bubble={bubble} />
      <div className="dsh-pet__bubble-content">
        {image !== undefined && <img className="dsh-pet__bubble-image" src={image} alt="" />}
        {hasTitle && <div className="dsh-pet__bubble-title">{bubble.title}</div>}
        {hasText && <div className="dsh-pet__bubble-text">{bubble.description}</div>}
      </div>
    </>
  )
}

function BubbleStack({ placement, bubbles }: { placement: PetBubblePlacement, bubbles: readonly PetBubble[] }) {
  if (bubbles.length === 0)
    return null
  // HeroUI 的方向（`toast.js`：`translateY = (isBottom ? -1 : 1) * index * gap`）：
  // `top` 区（气泡在头顶）往前/往下叠，`bottom` 区（脚下）往上叠 —— 旧的一条总被压在
  // 「更靠近宠物那一侧」。间距走 CSS 变量（随宠物宽度缩放），所以位移用 calc 表达。
  const direction = placement === 'bottom' ? -1 : 1

  return (
    <div className={joinClassNames('dsh-pet__bubbles', `dsh-pet__bubbles--${placement}`)}>
      {bubbles.map((bubble, position) => {
        // `index` = 距最新一条的距离：0 = 最前（完整尺寸），越大越旧、越靠后
        const index = bubbles.length - 1 - position
        const front = index === 0
        const hasImage = typeof bubble.image === 'string' && bubble.image !== ''
        return (
          <div
            key={bubble.id}
            className={joinClassNames(
              'dsh-pet__bubble',
              front ? 'dsh-pet__bubble--front' : 'dsh-pet__bubble--stacked',
              `dsh-pet__bubble--${bubble.variant}`,
              bubble.kind === 'muttering' && 'dsh-pet__bubble--muttering',
              hasImage && 'dsh-pet__bubble--has-image',
            )}
            style={{
              zIndex: bubbles.length - index,
              ...(front
                ? null
                : {
                    translate: `0 calc(clamp(6px, var(--dsh-pet-size, 462px) * 0.026, 12px) * ${direction * index})`,
                    scale: `${1 - index * STACK_SCALE_FACTOR}`,
                  }),
            }}
            role="status"
          >
            <PetBubbleItem bubble={bubble} />
          </div>
        )
      })}
    </div>
  )
}

export interface PetBubbleLayerProps {
  /** 气泡队列（旧 → 新） */
  bubbles: readonly PetBubble[]
}

/** 气泡叠加层：空队列什么都不渲染（不给宿主多加一个空盒子）。 */
export function PetBubbleLayer({ bubbles }: PetBubbleLayerProps) {
  if (bubbles.length === 0)
    return null
  return (
    <>
      <BubbleStack placement="top" bubbles={bubbles.filter(bubble => bubble.placement !== 'bottom')} />
      <BubbleStack placement="bottom" bubbles={bubbles.filter(bubble => bubble.placement === 'bottom')} />
    </>
  )
}
