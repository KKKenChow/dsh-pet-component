import type { PetBubble, PetBubblePlacement } from '../types'

/**
 * 气泡叠加层（内部组件）—— 由 `Pet` 通过渲染器的 `overlay` 槽挂进根盒子里。
 *
 * 三条规则（与 `usePetBubbles` 的队列一一对应）：
 * - 队列顺序 = 叠放顺序（旧 → 新，最新的最靠近宠物）；
 * - `placement` 分成上下两摞：`top` 在头顶（尾巴朝下）、`bottom` 在脚下（尾巴朝上）；
 * - 元素按需挂载/卸载，淡入由 `src/styles.ts` 的 keyframes 负责（原地更新不重新淡入）。
 *
 * 全部内容由宿主提供（`title` / `description` / `icon` / `image`），组件只负责排版与
 * 「像 dsh-pet 那样长在宠物身上」的观感：白气泡 + 尾巴 + 按宠物宽度等比缩放。
 */

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/** 内置图标槽：显式 `icon` > 加载圆环 > 语义字形（`default` 不占位）。 */
function BubbleIcon({ bubble }: { bubble: PetBubble }) {
  if (bubble.icon != null)
    return <span className="dsh-pet__bubble-icon">{bubble.icon}</span>
  if (bubble.loading)
    return <span className="dsh-pet__bubble-spinner" aria-hidden="true" />
  if (bubble.variant === 'default')
    return null
  const glyph = bubble.variant === 'success' ? '✓' : bubble.variant === 'warning' ? '!' : '×'
  return <span className="dsh-pet__bubble-glyph" aria-hidden="true">{glyph}</span>
}

function PetBubbleItem({ bubble }: { bubble: PetBubble }) {
  const image = typeof bubble.image === 'string' && bubble.image !== '' ? bubble.image : undefined
  const hasTitle = bubble.title != null && bubble.title !== ''
  const hasHead = bubble.icon != null || bubble.loading || bubble.variant !== 'default' || hasTitle

  return (
    <div
      className={joinClassNames(
        'dsh-pet__bubble',
        `dsh-pet__bubble--${bubble.variant}`,
        bubble.kind === 'muttering' && 'dsh-pet__bubble--muttering',
        image !== undefined && 'dsh-pet__bubble--has-image',
      )}
      role="status"
    >
      {image !== undefined && <img className="dsh-pet__bubble-image" src={image} alt="" />}
      {hasHead && (
        <div className="dsh-pet__bubble-head">
          <BubbleIcon bubble={bubble} />
          {hasTitle && <div className="dsh-pet__bubble-title">{bubble.title}</div>}
        </div>
      )}
      {bubble.description != null && bubble.description !== '' && (
        <div className="dsh-pet__bubble-text">{bubble.description}</div>
      )}
    </div>
  )
}

function BubbleStack({ placement, bubbles }: { placement: PetBubblePlacement, bubbles: readonly PetBubble[] }) {
  if (bubbles.length === 0)
    return null
  return (
    <div className={joinClassNames('dsh-pet__bubbles', `dsh-pet__bubbles--${placement}`)}>
      {bubbles.map(bubble => <PetBubbleItem key={bubble.id} bubble={bubble} />)}
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
