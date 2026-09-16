import type { PetBubble } from '../../src/types'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { PetBubbleLayer } from '../../src/components/bubble-layer'
import { mountPetStyles, unmountPetStyles } from '../../src/styles'
import { createBubble } from '../../src/utils/bubble'

/**
 * 真样式、真过渡 —— 这一组用的是**浏览器实际算出来的样式与动画**，
 * 而不是 class 名。它回答的是「动画到底动了没有」：
 *
 * - `.dsh-pet__bubble` 的过渡是否真的覆盖 `opacity / translate / scale`；
 * - 退场那条是否真的建起 CSS 过渡（`getAnimations()`）；
 * - 非最前那条的内容是不是真的不可见、被顶到最前时是否真的淡回来。
 *
 * 组件本身不注入样式（`Pet` 才注入），所以这里手动 `mountPetStyles()`。
 */

function bubble(id: string, created: number, options: Parameters<typeof createBubble>[0] = {}): PetBubble {
  return createBubble(options, id, created)
}

function query(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (element === null)
    throw new Error(`找不到元素：${selector}`)
  return element
}

/** 当前节点上跑着的 CSS 过渡覆盖了哪些属性。 */
function transitionProperties(element: HTMLElement): string[] {
  return element.getAnimations()
    .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
    .map(animation => animation.transitionProperty)
}

beforeAll(() => mountPetStyles())
afterAll(() => unmountPetStyles())

describe('气泡过渡属性', () => {
  it('过渡覆盖 opacity / translate / scale（退场滑出与淡出的前提）', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A' })]} />)
    const style = getComputedStyle(query(container, '.dsh-pet__bubble'))

    expect(style.transitionProperty).toContain('opacity')
    expect(style.transitionProperty).toContain('translate')
    expect(style.transitionProperty).toContain('scale')
  })

  it('入场动画是样式表里那条 dsh-pet-bubble-in', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A' })]} />)
    const element = query(container, '.dsh-pet__bubble')

    await vi.waitFor(() => {
      const names = element.getAnimations()
        .filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation)
        .map(animation => animation.animationName)
      expect(names).toContain('dsh-pet-bubble-in')
    }, { timeout: 1000 })
  })
})

describe('气泡退场动画真的在动', () => {
  it('退场的气泡会滑出并淡到透明', async () => {
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A' })]} />)
    // 先等入场动画播完：元素「插入后同一帧就改样式」时浏览器没有可比的前值，
    // 过渡压根不会建立 —— 等它成为一条静止的气泡，才是真实的收起场景
    await vi.waitFor(() => {
      expect(container.querySelector('.dsh-pet__bubble--entering')).toBeNull()
    }, { timeout: 2000 })

    await rerender(<PetBubbleLayer bubbles={[]} />)
    const leaving = query(container, '.dsh-pet__bubble--leaving')

    // 过渡只在真实样式变化时才会建立，所以这一条同时证明「淡出 + 滑出」都被接上了
    await vi.waitFor(() => {
      const properties = transitionProperties(leaving)
      expect(properties).toContain('opacity')
      expect(properties).toContain('translate')
    }, { timeout: 200 })
  })
})

describe('非最前那条的内容不可见', () => {
  it('压在后排时内容透明，被顶到最前时淡回可见', async () => {
    const older = bubble('a', 1, { title: 'A' })
    const newer = bubble('b', 2, { title: 'B' })
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[older]} />)
    await rerender(<PetBubbleLayer bubbles={[older, newer]} />)

    const stacked = query(container, '.dsh-pet__bubble--stacked .dsh-pet__bubble-content')
    // 内容是被「淡出」到不可见的（HeroUI 折叠态那 200ms），所以不能同步读
    await vi.waitFor(() => {
      expect(getComputedStyle(stacked).opacity).toBe('0')
    }, { timeout: 2000 })

    // 收起 B → A 被顶到最前，内容应当淡回 1（HeroUI 折叠态的 200ms 内容过渡）
    await rerender(<PetBubbleLayer bubbles={[older]} />)
    await vi.waitFor(() => {
      expect(container.querySelector('.dsh-pet__bubble--leaving')).toBeNull()
    }, { timeout: 2000 })

    const promoted = query(container, '.dsh-pet__bubble--front .dsh-pet__bubble-content')
    await vi.waitFor(() => {
      expect(getComputedStyle(promoted).opacity).toBe('1')
    }, { timeout: 2000 })
  })
})
