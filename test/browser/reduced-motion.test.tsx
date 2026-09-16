import type { CodexPetConfig } from '../../src/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { CodexPet } from '../../src/components/codex-pet'
import { makeCodexConfig, makeSpritesheetDataUrl, nextFrames, query } from './support/fixtures'

/**
 * `prefers-reduced-motion: reduce` 分支。
 *
 * 组件自己不读媒体查询 —— 走的是 reause 的 `usePreferredReducedMotion()`，其实现就是
 * `useMediaQuery('(prefers-reduced-motion: reduce)')`
 * （见 `node_modules/@reause/core/dist/index.js` 的 `usePreferredReducedMotion/index.tsx`），
 * 所以 stub `window.matchMedia` 就能在页面里把这条分支打开。
 */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** 让 `prefers-reduced-motion` 在页面里按 `matches` 取值（其余查询一律不匹配）。 */
function stubMatchMedia(matches: boolean): void {
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const list = {
    matches,
    media: REDUCED_QUERY,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.add(listener),
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    addListener: (listener: EventListenerOrEventListenerObject) => listeners.add(listener),
    removeListener: (listener: EventListenerOrEventListenerObject) => listeners.delete(listener),
    dispatchEvent: () => true,
  }
  vi.stubGlobal('matchMedia', (media: string) =>
    media.includes('reduced-motion') ? list : { ...list, matches: false })
}

function renderCodex(config: CodexPetConfig = makeCodexConfig()) {
  return render(
    <CodexPet
      config={config}
      uri={makeSpritesheetDataUrl({ rows: config.rows ?? 11 })}
      motion={{ type: 'idle', loop: true }}
    />,
  )
}

/** 把光标移到宠物中心右侧 60px（在 look 作用半径内、超出死区）。 */
function pointNearPet(root: HTMLElement): void {
  const rect = root.getBoundingClientRect()
  window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: rect.left + rect.width / 2 + 60,
    clientY: rect.top + rect.height / 2,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('减少动效（prefers-reduced-motion: reduce）', () => {
  it('关闭时鼠标追踪 look 生效，开启后同一动作不再设 data-look', async () => {
    // 对照组：没有减少动效时，同一动作会落到某个 look 格
    stubMatchMedia(false)
    const normal = await renderCodex()
    const normalRoot = query(normal.container, '.dsh-pet')
    pointNearPet(normalRoot)
    await nextFrames(2)
    expect(normalRoot.getAttribute('data-look')).not.toBeNull()

    // 减少动效：同一个动作完全不设 look
    stubMatchMedia(true)
    const reduced = await renderCodex()
    const reducedRoot = query(reduced.container, '.dsh-pet')
    pointNearPet(reducedRoot)
    await nextFrames(2)
    expect(reducedRoot.getAttribute('data-look')).toBeNull()
  })

  it('开启后精灵帧不再推进（待机停在第一帧）', async () => {
    stubMatchMedia(true)
    const { container } = await renderCodex()
    const sprite = query(container, '.dsh-pet__sprite')

    await nextFrames(2)
    const first = sprite.style.backgroundPosition
    // 第一帧必须画出来了，否则下面「没变」就没有意义
    expect(first).not.toBe('')

    // 默认帧长 140ms 上下：等足 500ms，会推进的话早就不是第一帧了
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(sprite.style.backgroundPosition).toBe(first)
  })
})
