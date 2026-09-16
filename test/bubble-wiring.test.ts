import type { PetBubble } from '../src/types/bubble'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMutteringController } from '../src/hooks/use-muttering'
import { createBubbleTracker } from '../src/utils/bubble-tracker'

/**
 * 气泡接线：把 `Pet` 的碎碎念链路（controller → 状态机 → 可见层）整条跑一遍，
 * 以及「可见层重建」的两个边界 —— 每一条都对应一个真实报上来的现象。
 */

interface Harness {
  tracker: ReturnType<typeof createBubbleTracker>
  snaps: (readonly PetBubble[])[]
  advance: (ms: number) => void
}

function harness(): Harness {
  let clock = 1_000_000
  const snaps: (readonly PetBubble[])[] = []
  const tracker = createBubbleTracker({ now: () => clock, onBubbles: bubbles => snaps.push(bubbles) })
  const advance = (ms: number) => {
    clock += ms
    vi.advanceTimersByTime(ms)
  }
  return { tracker, snaps, advance }
}

describe('气泡接线', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('碎碎念那一条：按宿主给的时长到点自动收起，再次展示仍会出现', () => {
    const { tracker, advance } = harness()
    const pushed: string[] = []
    // 与 `Pet` 的接线一致：先 clear() 掉状态气泡，再挂碎碎念那一条
    const controller = createMutteringController({
      enabled: true,
      prompt: '',
      intervalSec: 300,
      immediate: false,
      duration: 10_000,
      image: false,
      onMuttering: () => pushed.push('ask'),
      onPlay: () => {},
      onShow: (text, options) => {
        tracker.clear()
        tracker.show({ id: 'dsh-pet-muttering', kind: 'muttering', title: text, timeout: options.duration })
      },
    })

    controller.tick() // 首拍：baseline
    controller.tick() // 第二拍：tick
    expect(pushed).toEqual(['ask', 'ask'])

    controller.show('第一句')
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['dsh-pet-muttering'])
    expect(tracker.bubbles[0]?.duration).toBe(10_000)

    advance(9_999)
    expect(tracker.bubbles).toHaveLength(1)
    advance(1)
    expect(tracker.bubbles).toHaveLength(0)

    // 再来一句：`clear()` 之后会话登记已重置，必须还能出现
    controller.show('第二句')
    expect(tracker.bubbles).toHaveLength(1)
  })

  it('无档位通知气泡：收起后同 id 再 show 仍会重新出现（不能被「同档位」挡掉）', () => {
    const { tracker, advance } = harness()
    tracker.show({ id: 'warn', title: '需要注意', variant: 'warning', timeout: 2_500 })
    expect(tracker.bubbles).toHaveLength(1)

    advance(2_500)
    expect(tracker.bubbles).toHaveLength(0)

    // 5s 沉淀窗口内再点一次也必须出现（无档位气泡没有「同档位」可言）
    tracker.show({ id: 'warn', title: '需要注意', variant: 'warning', timeout: 2_500 })
    expect(tracker.bubbles).toHaveLength(1)
  })

  it('插播动画结束后：由渲染器回报的动画变化收起碎碎念气泡', () => {
    // `Pet` 的接法：记住插播的动画名，渲染器回报的动画不再是它就 close()
    const { tracker } = harness()
    tracker.show({ id: 'dsh-pet-muttering', kind: 'muttering', title: '一句话', timeout: 10_000 })
    expect(tracker.bubbles).toHaveLength(1)

    const whisper = '碎碎念-发呆碎碎念'
    const onAnimationChange = (name: string | undefined) => {
      if (name !== whisper)
        tracker.close('dsh-pet-muttering')
    }
    onAnimationChange(whisper) // 插播中：不动
    expect(tracker.bubbles).toHaveLength(1)
    onAnimationChange('待机呼吸休闲') // 播完回落：收起
    expect(tracker.bubbles).toHaveLength(0)
  })

  it('失败之后点加载：语义色跟着状态回到 Info，不继承上一条的 danger', () => {
    const { tracker } = harness()
    tracker.show({ id: 'demo', title: '会话', description: '写入失败：权限不足', variant: 'danger', motion: 'failed' })
    expect(tracker.bubbles[0]?.variant).toBe('danger')
    expect(tracker.bubbles[0]?.duration).toBe(4000)

    // 「加载」按钮：同一个 id，只给状态、不给语义色
    tracker.show({ id: 'demo', title: '会话', description: '正在分析代码…', loading: true, motion: 'thinking' })
    expect(tracker.bubbles[0]?.variant).toBe('default')
    expect(tracker.bubbles[0]?.duration).toBe(0)
    expect(tracker.bubbles[0]?.loading).toBe(true)
  })

  it('只给档位、不给语义色：颜色按档位推导（success → success）', () => {
    const { tracker } = harness()
    tracker.show({ id: 's', title: '会话', description: '分析完成', motion: 'success' })
    expect(tracker.bubbles[0]?.variant).toBe('success')
    tracker.show({ id: 's', title: '会话', description: '换了句文字' })
    expect(tracker.bubbles[0]?.variant).toBe('success')
  })
})
