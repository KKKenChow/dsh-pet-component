import type { PetBubble } from '../../src/types'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { PetBubbleLayer } from '../../src/components/bubble-layer'
import { createBubble } from '../../src/utils/bubble'

/**
 * 气泡叠加层的真 DOM 行为 —— 队列顺序、层叠、以及**进 / 退场动画的挂载语义**。
 *
 * 这些用例锁的都是用户实际报过的观感缺陷：
 * - 气泡收起时没有动画（列表一删，节点直接消失）；
 * - 「闪两次」（被顶到最前时重播淡入）。
 */

/** 建一条真气泡：走真实的 `createBubble`，默认值由组件自己解析，不手写 shape。 */
function bubble(id: string, created: number, options: Parameters<typeof createBubble>[0] = {}): PetBubble {
  return createBubble(options, id, created)
}

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('.dsh-pet__bubble')]
}

/** 取一个必然存在的元素：测试里缺元素应当抛错，而不是静默拿到 `undefined`。 */
function query(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (element === null)
    throw new Error(`找不到元素：${selector}`)
  return element
}

describe('气泡层队列', () => {
  it('空队列什么都不渲染', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('最新的一条在最前，更旧的按 index 缩小并偏移', async () => {
    const older = bubble('a', 1, { title: 'A' })
    const newer = bubble('b', 2, { title: 'B' })
    const { container } = await render(<PetBubbleLayer bubbles={[older, newer]} />)

    const [first, second] = rows(container)
    // DOM 顺序按 `created` 升序（旧 → 新），「最前」由 index 决定
    expect(first.textContent).toContain('A')
    expect(first.className).toContain('dsh-pet__bubble--stacked')
    expect(first.style.scale).toBe('0.95')
    expect(first.style.translate).not.toBe('')
    expect(first.style.zIndex).toBe('1')

    expect(second.textContent).toContain('B')
    expect(second.className).toContain('dsh-pet__bubble--front')
    // 最前那条不缩放、不偏移，且层级最高
    expect(second.style.scale).toBe('')
    expect(second.style.translate).toBe('')
    expect(second.style.zIndex).toBe('2')
  })

  it('语义色与内容走各自的 class', async () => {
    const { container } = await render(
      <PetBubbleLayer
        bubbles={[
          bubble('a', 1, { title: '标题', description: '正文', variant: 'danger' }),
          bubble('b', 2, { variant: 'success', image: 'https://example.com/x.png' }),
        ]}
      />,
    )

    expect(query(container, '.dsh-pet__bubble--danger .dsh-pet__bubble-title').textContent).toBe('标题')
    expect(query(container, '.dsh-pet__bubble--danger .dsh-pet__bubble-text').textContent).toBe('正文')
    expect(container.querySelector('.dsh-pet__bubble--success')).not.toBeNull()
    // 带配图的那条额外挂一个 class（宽度与内边距不同）
    expect(container.querySelector('.dsh-pet__bubble--has-image')).not.toBeNull()
    expect(query(container, '.dsh-pet__bubble-image').getAttribute('src')).toBe('https://example.com/x.png')
  })

  it('默认图标只在非碎碎念、非加载态时占位', async () => {
    const { container } = await render(
      <PetBubbleLayer
        bubbles={[
          bubble('a', 1, { title: '状态' }),
          bubble('b', 2, { title: '说话', kind: 'muttering' }),
        ]}
      />,
    )

    expect(container.querySelectorAll('.dsh-pet__bubble-indicator')).toHaveLength(1)
    expect(query(container, '.dsh-pet__bubble--muttering').className).toContain('dsh-pet__bubble--muttering')
    expect(container.querySelector('.dsh-pet__bubble--muttering .dsh-pet__bubble-indicator')).toBeNull()
  })

  it('bottom 方向的气泡进底部栈，top 的进顶部栈', async () => {
    const { container } = await render(
      <PetBubbleLayer
        bubbles={[
          bubble('a', 1, { title: '上' }),
          bubble('b', 2, { title: '下', placement: 'bottom' }),
        ]}
      />,
    )

    expect(query(container, '.dsh-pet__bubbles--top').textContent).toContain('上')
    expect(query(container, '.dsh-pet__bubbles--bottom').textContent).toContain('下')
  })

  it('role=status 供读屏朗读', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A' })]} />)
    expect(query(container, '.dsh-pet__bubble').getAttribute('role')).toBe('status')
  })

  it('四种语义色各自渲染内置图标', async () => {
    const variants = ['default', 'success', 'warning', 'danger'] as const
    const { container } = await render(
      <PetBubbleLayer bubbles={variants.map((variant, index) => bubble(`v${index}`, index + 1, { variant }))} />,
    )

    for (const variant of variants)
      expect(query(container, `.dsh-pet__bubble--${variant} .dsh-pet__bubble-indicator svg`)).not.toBeNull()
  })

  it('宿主显式给了 icon 就覆盖内置图标', async () => {
    const { container } = await render(
      <PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A', icon: <b data-custom="1" /> })]} />,
    )

    expect(container.querySelector('.dsh-pet__bubble-indicator b')).not.toBeNull()
    // 内置图标没有被渲染出来（宿主给了就只用宿主的）
    expect(container.querySelector('.dsh-pet__bubble-indicator svg')).toBeNull()
  })

  it('加载态换成圆环（两段圆弧 + 两个渐变，id 由 useId 派生）', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { loading: true })]} />)

    const spinner = query(container, '.dsh-pet__bubble-spinner')
    expect(spinner.getAttribute('aria-hidden')).toBe('true')
    const gradients = [...spinner.querySelectorAll('linearGradient')]
    expect(gradients).toHaveLength(2)
    const ids = gradients.map(gradient => gradient.getAttribute('id'))
    expect(ids.every(id => id !== null && id !== '')).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('气泡出场生命周期', () => {
  it('气泡被收起时先留在层里放退场动画，到点才卸载', async () => {
    const older = bubble('a', 1, { title: 'A' })
    const newer = bubble('b', 2, { title: 'B' })
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[older, newer]} />)
    expect(rows(container)).toHaveLength(2)

    // 收起 A：节点必须还在 DOM 里，否则根本没过渡可看
    await rerender(<PetBubbleLayer bubbles={[newer]} />)
    const leaving = query(container, '.dsh-pet__bubble--leaving')
    expect(leaving.textContent).toContain('A')
    expect(rows(container)).toHaveLength(2)

    // 退场时长（250ms）之后才真的摘掉
    await vi.waitFor(() => {
      expect(container.querySelector('.dsh-pet__bubble--leaving')).toBeNull()
    }, { timeout: 2000 })
    expect(rows(container)).toHaveLength(1)
    expect(rows(container)[0].textContent).toContain('B')
  })

  it('退场中的气泡保持它原来的层叠位置，不跳到最前', async () => {
    const older = bubble('a', 1, { title: 'A' })
    const newer = bubble('b', 2, { title: 'B' })
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[older, newer]} />)

    await rerender(<PetBubbleLayer bubbles={[newer]} />)
    const leaving = query(container, '.dsh-pet__bubble--leaving')
    // 它原来是 index 1（靠后），退场期间仍然是靠后的那条
    expect(leaving.className).toContain('dsh-pet__bubble--stacked')
    expect(leaving.style.scale).toBe('0.95')
  })

  it('同一个 id 又被推出来时，退场那条立刻让位（不会出现两条同 key）', async () => {
    const first = bubble('a', 1, { title: '第一版' })
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[first]} />)

    await rerender(<PetBubbleLayer bubbles={[]} />)
    expect(container.querySelector('.dsh-pet__bubble--leaving')).not.toBeNull()

    // 同 id 立刻重推：退场中的旧节点必须消失，不能和新的那条并存
    await rerender(<PetBubbleLayer bubbles={[createBubble({ title: '第二版' }, 'a', 5)]} />)
    expect(rows(container)).toHaveLength(1)
    expect(container.textContent).toContain('第二版')
    expect(container.querySelector('.dsh-pet__bubble--leaving')).toBeNull()
  })
})

describe('入场动画只属于刚挂载的那条', () => {
  it('刚挂载时挂 --entering，到点摘掉', async () => {
    const { container } = await render(<PetBubbleLayer bubbles={[bubble('a', 1, { title: 'A' })]} />)
    expect(container.querySelector('.dsh-pet__bubble--entering')).not.toBeNull()

    await vi.waitFor(() => {
      expect(container.querySelector('.dsh-pet__bubble--entering')).toBeNull()
    }, { timeout: 2000 })
  })

  it('被顶到最前的老气泡不重播淡入 —— 「闪两次」的回归守卫', async () => {
    const older = bubble('a', 1, { title: 'A' })
    const { container, rerender } = await render(<PetBubbleLayer bubbles={[older]} />)
    // 等它的入场动画彻底结束
    await vi.waitFor(() => {
      expect(container.querySelector('.dsh-pet__bubble--entering')).toBeNull()
    }, { timeout: 2000 })

    // 新气泡插到最前：A 从 `--front` 变成 `--stacked`，但**不该**再有入场动画
    await rerender(<PetBubbleLayer bubbles={[older, bubble('b', 2, { title: 'B' })]} />)
    const entering = container.querySelectorAll<HTMLElement>('.dsh-pet__bubble--entering')
    expect(entering).toHaveLength(1)
    expect(entering[0].textContent).toContain('B')
  })
})
