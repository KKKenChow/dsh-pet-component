import type { CodexPetProps, PetRef } from '../../src/types'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { CodexPet } from '../../src/components/codex-pet'
import { makeCodexConfig, makeSpritesheetDataUrl, nextFrames, query } from './support/fixtures'

/**
 * 渲染器的 prop 面：look 半径 / 死区覆盖、`hitboxRef` 转发、`onMotionChange`、
 * 自定义帧定义、平台形态的 `uri`、v1 图集，以及「只给 `spritesheetPath`」时的地址解析
 * （配置文件是 `/test/fixtures/pets/pet.json`，雪碧图是同目录的 `sprite.png`）。
 *
 * 这些断言都用 `cache={false}`：默认的 IndexedDB 缓存会把地址换成 `blob:` URL，
 * 那就看不出「解析出来的到底是哪条地址」了。
 */

function renderCodex(overrides: Partial<CodexPetProps> = {}) {
  const props: CodexPetProps = {
    config: makeCodexConfig(),
    uri: makeSpritesheetDataUrl(),
    motion: { type: 'idle', loop: true },
    cache: false,
    ...overrides,
  }
  return render(<CodexPet {...props} />)
}

/** 把光标移到宠物中心右侧 `offset` px。 */
function pointNearPet(root: HTMLElement, offset: number): void {
  const rect = root.getBoundingClientRect()
  window.dispatchEvent(new PointerEvent('pointermove', {
    clientX: rect.left + rect.width / 2 + offset,
    clientY: rect.top + rect.height / 2,
  }))
}

describe('渲染器 prop 面（Codex）', () => {
  it('lookRadius 调小后，同一位置直接回落待机', async () => {
    const { container } = await renderCodex({ lookRadius: 30 })
    const root = query(container, '.dsh-pet')
    pointNearPet(root, 60)
    await nextFrames(2)
    expect(root.getAttribute('data-look')).toBeNull()
  })

  it('lookDeadzone 放大到 200 后，中心附近也算死区', async () => {
    const { container } = await renderCodex({ lookDeadzone: 200 })
    const root = query(container, '.dsh-pet')
    pointNearPet(root, 60)
    await nextFrames(2)
    expect(root.getAttribute('data-look')).toBeNull()
  })

  it('hitboxRef 指到命中区，指针事件从那里透传', async () => {
    const hitboxRef = createRef<HTMLDivElement>()
    const onHitboxPointerDown = vi.fn()
    const { container } = await renderCodex({ hitboxRef, onHitboxPointerDown })

    const hitbox = query(container, '.dsh-pet__hitbox')
    expect(hitboxRef.current).toBe(hitbox)

    hitbox.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await nextFrames(1)
    expect(onHitboxPointerDown).toHaveBeenCalledTimes(1)
  })

  it('onMotionChange 只在动作变化时上报（初值不报）', async () => {
    const onMotionChange = vi.fn()
    const ref = createRef<PetRef>()
    const { container } = await renderCodex({ motion: { type: 'idle', loop: true }, onMotionChange, ref })
    await nextFrames(2)
    // `lastNotifiedRef` 初始化成当前动作，所以初值不算「变化」
    expect(onMotionChange).not.toHaveBeenCalled()

    ref.current?.motion('working')
    await nextFrames(2)
    expect(onMotionChange).toHaveBeenCalledWith('working')
    expect(query(container, '.dsh-pet').getAttribute('data-motion')).toBe('working')
  })

  it('config.motions 的帧定义覆盖行号与帧数', async () => {
    const config = makeCodexConfig({
      motions: { success: { row: 5, frames: 4, interval: 40, loop: false } },
    })
    const { container } = await render(
      <CodexPet config={config} uri={makeSpritesheetDataUrl()} motion={{ type: 'success' }} cache={false} />,
    )
    await nextFrames(2)
    expect(query(container, '.dsh-pet').getAttribute('data-row')).toBe('5')
  })

  it('uri 给空串且配置里没有 spritesheetPath 时不画图', async () => {
    const { container } = await render(
      <CodexPet config={makeCodexConfig()} uri="" motion={{ type: 'idle', loop: true }} cache={false} />,
    )
    await nextFrames(2)
    expect(query(container, '.dsh-pet__sprite').style.backgroundImage).toBe('')
  })

  it('v1 图集按 9 行铺', async () => {
    const { container } = await render(
      <CodexPet
        config={{ spriteVersionNumber: 1 }}
        uri={makeSpritesheetDataUrl({ rows: 9 })}
        motion={{ type: 'idle', loop: true }}
        cache={false}
      />,
    )
    await nextFrames(2)
    expect(query(container, '.dsh-pet__sprite').style.backgroundSize).toBe('800% 900%')
  })

  it('只给 spritesheetPath 时按配置文件所在目录解析雪碧图地址', async () => {
    const { container } = await render(
      <CodexPet config="/test/fixtures/pets/pet.json" motion={{ type: 'idle', loop: true }} cache={false} />,
    )
    const sprite = query(container, '.dsh-pet__sprite')
    await vi.waitFor(() => {
      expect(sprite.style.backgroundImage).toContain('/test/fixtures/pets/sprite.png')
    }, { timeout: 3000 })
  })
})
