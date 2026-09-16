import type { MotionInput, PetRef } from '../../src/types'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { PET_FALLBACK_MOTION } from '../../src/config'
import { usePetMotion } from '../../src/hooks/use-pet-motion'

/**
 * 声明层（`motion` prop）与命令面（`pet.motion(...)`）的交班规则 —— 真实 React 渲染。
 *
 * 这一组守的是真实回归：把会话气泡从「加载（常驻）」更新成「完成（限时）」时，
 * 聚合出的声明层会从 `thinking` 落下来，而限时那条归命令面播一次。**两次更新落在不同的
 * React 批次里**（聚合下发还带 100ms 合并窗口），所以声明层先变化、命令面后下发；
 * 如果交班规则写错，刚起播的动画会被那次 prop 变化清掉 —— 用户看到的就是「直接变成待机」。
 */

function renderMotion(initial?: MotionInput) {
  return renderHook((props: { motion?: MotionInput } = {}) => {
    const ref = useRef<PetRef | null>(null)
    return usePetMotion({ motion: props.motion, ref })
  }, { initialProps: { motion: initial } })
}

describe('petMotion 交班规则', () => {
  it('声明层动作直接生效，循环语义按动作本身判定', async () => {
    const view = await renderMotion('thinking')
    expect(view.result.current.state.type).toBe('thinking')
    expect(view.result.current.state.loop).toBe(true)
  })

  it('命令面优先于声明层', async () => {
    const view = await renderMotion('thinking')
    await view.act(() => {
      view.result.current.request({ type: 'success', replay: true })
    })

    expect(view.result.current.state.type).toBe('success')
    expect(view.result.current.state.loop).toBe(false)
  })

  it('正在播的一次性命令不被声明层变化掐断 —— 「直接变待机」回归守卫', async () => {
    const view = await renderMotion('thinking')
    await view.act(() => {
      view.result.current.request({ type: 'success', replay: true })
    })
    const revision = view.result.current.state.revision

    // 常驻气泡变限时气泡时，聚合态从 thinking 落下来：这一次变化不得打断庆祝动画
    await view.rerender({ motion: 'waiting' })

    expect(view.result.current.state.type).toBe('success')
    expect(view.result.current.state.revision).toBe(revision)
  })

  it('循环命令被声明层变化接替', async () => {
    const view = await renderMotion('thinking')
    await view.act(() => {
      view.result.current.request({ type: 'working', loop: true })
    })
    expect(view.result.current.state.type).toBe('working')

    await view.rerender({ motion: 'waiting' })

    expect(view.result.current.state.type).toBe('waiting')
  })

  it('一次性命令播完交还声明层，而不是落回待机', async () => {
    const view = await renderMotion('waiting')
    await view.act(() => {
      view.result.current.request({ type: 'success', replay: true })
    })
    expect(view.result.current.state.type).toBe('success')

    await view.act(() => {
      view.result.current.finish()
    })

    expect(view.result.current.state.type).toBe('waiting')
  })

  it('声明层自己的一次性动作播完才回落待机', async () => {
    const view = await renderMotion({ type: 'success', loop: false })
    expect(view.result.current.state.type).toBe('success')

    await view.act(() => {
      view.result.current.finish()
    })

    expect(view.result.current.state.type).toBe(PET_FALLBACK_MOTION)
  })

  it('clear() 清掉命令面，声明层重新接管', async () => {
    const view = await renderMotion('thinking')
    await view.act(() => {
      view.result.current.request({ type: 'success', replay: true })
    })
    expect(view.result.current.state.type).toBe('success')

    await view.act(() => {
      view.result.current.clear()
    })

    expect(view.result.current.state.type).toBe('thinking')
  })

  it('同一动作重复下发不重播，replay 才重播', async () => {
    const view = await renderMotion()
    await view.act(() => {
      view.result.current.request('working')
    })
    const revision = view.result.current.state.revision

    await view.act(() => {
      view.result.current.request('working')
    })
    expect(view.result.current.state.revision).toBe(revision)

    await view.act(() => {
      view.result.current.request({ type: 'working', replay: true })
    })
    expect(view.result.current.state.revision).toBe(revision + 1)
  })
})
