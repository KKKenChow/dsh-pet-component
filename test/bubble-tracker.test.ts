import type { PetBubble } from '../src/types/bubble'
import type { MotionInput } from '../src/types/motion'
import type { BubbleTrackerOptions } from '../src/utils/bubble-tracker'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBubbleTracker } from '../src/utils/bubble-tracker'

/**
 * 会话气泡状态机的行为测试 —— 每一条都对应参考实现的一段机制
 * （`source/deepseek-harness-desktop/src/pet/utils/bubble-tracker.ts` 与
 * `src/utils/toast.ts`），也对应我们踩过的回归。
 */

/** 聚合合并窗口（参考实现 `STATUS_COALESCE_MS`）。 */
const COALESCE = 100

interface Harness {
  tracker: ReturnType<typeof createBubbleTracker>
  motions: (MotionInput | undefined)[]
  snapshots: (readonly PetBubble[])[]
  /** 推进时间：注入时钟与定时器同步前进 */
  advance: (ms: number) => void
  /** 只走一个合并窗口，让聚合值下发 */
  flush: () => void
}

function setup(options: BubbleTrackerOptions = {}): Harness {
  const motions: (MotionInput | undefined)[] = []
  const snapshots: (readonly PetBubble[])[] = []
  const tracker = createBubbleTracker({
    onMotion: motion => motions.push(motion),
    onBubbles: bubbles => snapshots.push(bubbles),
    ...options,
  })
  const advance = (ms: number) => {
    vi.advanceTimersByTime(ms)
  }
  return { tracker, motions, snapshots, advance, flush: () => advance(COALESCE) }
}

describe('createBubbleTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /* ------------------------------- 可见层 ------------------------------- */

  it('新气泡追加在末尾（渲染时最新的一条最靠近宠物）', () => {
    const { tracker } = setup()
    tracker.show({ id: 'a', description: 'a' })
    tracker.show({ id: 'b', description: 'b' })
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['a', 'b'])
  })

  it('同 id 再次下发 = 原地更新（不新增条目，也不重排）', () => {
    const { tracker } = setup()
    tracker.show({ id: 's1', description: '正在处理', loading: true, motion: 'thinking' })
    tracker.show({ id: 's1', description: '已完成' })
    expect(tracker.bubbles).toHaveLength(1)
    // 加载态没被清掉 → 语义色仍是 Info 档
    expect(tracker.bubbles[0]).toMatchObject({ description: '已完成', variant: 'default', motion: 'thinking' })
  })

  it('缺省 id 自增且带前缀（避免与宿主的 id 撞车）', () => {
    const { tracker } = setup()
    const first = tracker.show({ description: 'a' })
    const second = tracker.show({ description: 'b' })
    expect(first).not.toBe(second)
    expect(first.startsWith('dsh-pet-bubble-')).toBe(true)
  })

  it('onShow 只在创建时回调一次，更新走 onUpdate', () => {
    const shown: string[] = []
    const updated: string[] = []
    const { tracker } = setup({
      onShow: bubble => shown.push(bubble.id),
      onUpdate: bubble => updated.push(String(bubble.description)),
    })
    tracker.show({ id: 'a', description: 'a', motion: 'thinking' })
    tracker.show({ id: 'a', description: 'b' })
    expect(shown).toEqual(['a'])
    expect(updated).toEqual(['b'])
  })

  it('close() 缺省收起最近一次创建/更新的那条；close(id) 只收指定那条', () => {
    const { tracker } = setup()
    tracker.show({ id: 'a', description: 'a' })
    tracker.show({ id: 'b', description: 'b' })
    tracker.show({ id: 'a', description: 'a2' })
    tracker.close()
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['b'])
    tracker.close('b')
    expect(tracker.bubbles).toHaveLength(0)
  })

  it('clear() 收全部；dispose() 释放定时器且不炸', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 'a', description: 'a', motion: 'success' })
    tracker.show({ id: 'b', description: 'b' })
    tracker.clear()
    expect(tracker.bubbles).toHaveLength(0)

    tracker.show({ id: 'c', description: 'c', motion: 'success' })
    tracker.dispose()
    expect(tracker.bubbles).toHaveLength(0)
    expect(() => advance(20_000)).not.toThrow()
  })

  /* -------------------------- 上限淘汰（只动可见层） -------------------------- */

  it('超过上限关最旧，但会话状态仍在聚合里（上限只影响可见层）', () => {
    const { tracker, motions, flush, advance } = setup()
    // 常驻的加载态会话
    tracker.show({ id: 'loading', description: '加载中', loading: true, motion: 'thinking' })
    flush()
    expect(motions.at(-1)).toBe('thinking')

    // 三条叠加：加载态被挤下可见层（对齐 MAX_VISIBLE_TOASTS 淘汰）
    for (const id of ['a', 'b', 'c'])
      tracker.show({ id, description: id, motion: 'success' })
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['a', 'b', 'c'])

    // 三条终态气泡 3s 后收起 → 动作仍然是加载态的 thinking（这正是回归点）
    advance(3000)
    expect(tracker.bubbles).toHaveLength(0)
    flush()
    expect(motions.at(-1)).toBe('thinking')

    // 再过很久也还是 thinking：三条终态气泡是**限时**的，从不参与声明式聚合
    advance(20_000)
    flush()
    expect(motions.at(-1)).toBe('thinking')
  })

  /* --------------------------- 两条动画通道的分工 --------------------------- */

  it('限时气泡（timeout > 0）不进声明式聚合：动画由 Pet 用 pet.motion(...) 播一次', () => {
    const { tracker, motions, flush, advance } = setup()
    tracker.show({ id: 'f', description: '失败', motion: 'failed' })
    flush()
    // 从出现到收起，声明式聚合里始终没有它（所以气泡超时收起不可能掐断动画）
    expect(motions.at(-1)).toBeUndefined()
    advance(4000)
    expect(tracker.bubbles).toHaveLength(0)
    flush()
    expect(motions.at(-1)).toBeUndefined()
  })

  it('常驻气泡（timeout: 0）参与聚合；同一个 id 改成限时后退出聚合', () => {
    const { tracker, motions, flush } = setup()
    tracker.show({ id: 't', description: '思考中', motion: 'thinking' })
    flush()
    expect(motions.at(-1)).toBe('thinking')

    tracker.show({ id: 't', description: '思考中', motion: 'thinking', timeout: 5000 })
    flush()
    expect(motions.at(-1)).toBeUndefined()
  })

  /* ------------------------------ dismissed ------------------------------ */

  it('收起过的同档位不再弹出来；换成别的档位重新可见', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 's', description: '完成', motion: 'success' })
    advance(3000)
    expect(tracker.bubbles).toHaveLength(0)

    // 同档位（previous === current）→ 不再重建
    tracker.show({ id: 's', description: '完成（重复）', motion: 'success' })
    expect(tracker.bubbles).toHaveLength(0)

    // 换档位 → 重新可见
    tracker.show({ id: 's', description: '继续工作', motion: 'thinking' })
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['s'])
  })

  /* ------------------------------ 聚合规则 ------------------------------ */

  it('优先级：等待档压过一切，同档取先登记的（statusOf 的 `>` 比较）', () => {
    const { tracker, motions, flush } = setup()
    tracker.show({ id: 'a', description: '思考', motion: 'thinking' })
    tracker.show({ id: 'b', description: '等待', motion: 'waiting' })
    flush()
    expect(motions.at(-1)).toBe('waiting')

    const second = setup()
    second.tracker.show({ id: 'a', description: '思考', motion: 'thinking' })
    second.tracker.show({ id: 'b', description: '思考', motion: { type: 'thinking' } })
    second.flush()
    expect(second.motions.at(-1)).toBe('thinking')
  })

  it('优先级 0 的档位（idle / waving …）不驱动动作，与参考实现一致', () => {
    const { tracker, motions, flush } = setup()
    tracker.show({ id: 'a', description: 'a', motion: 'waving' })
    flush()
    expect(motions).toEqual([])
  })

  it('合并窗口：突发多档只下发最终聚合态一次（STATUS_COALESCE_MS）', () => {
    const { tracker, motions, flush } = setup()
    tracker.show({ id: 'a', description: 'a', motion: 'thinking' })
    tracker.show({ id: 'b', description: 'b', motion: 'working' })
    tracker.show({ id: 'a', description: 'a2', motion: 'result' })
    expect(motions).toEqual([])
    flush()
    // 最终聚合 = working(30) > result(25)；中间的 thinking / result 被丢弃
    expect(motions).toEqual(['working'])
  })

  it('没有 motion 的气泡不参与聚合（纯提示气泡）', () => {
    const { tracker, motions, flush } = setup()
    tracker.show({ id: 'a', description: '你好' })
    flush()
    expect(motions).toEqual([])
    expect(tracker.bubbles).toHaveLength(1)
  })

  /* ---------------------------- 计时与沉淀 ---------------------------- */

  it('只有转入终态档才排计时器；工作档常驻', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 's', description: '处理中', loading: true, motion: 'thinking' })
    advance(10_000)
    expect(tracker.bubbles).toHaveLength(1)

    tracker.show({ id: 's', description: '已完成', loading: false, motion: 'success' })
    advance(2999)
    expect(tracker.bubbles).toHaveLength(1)
    advance(1)
    expect(tracker.bubbles).toHaveLength(0)
  })

  it('同 id 的纯文字更新不重置自动收起计时', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 's', description: 'x', motion: 'success' })
    advance(2000)
    tracker.show({ id: 's', description: 'y' })
    advance(999)
    expect(tracker.bubbles).toHaveLength(1)
    advance(1)
    expect(tracker.bubbles).toHaveLength(0)
  })

  it('显式 timeout 覆盖档位时长；改成 0 即取消收起', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 's', description: 'x', motion: 'success', timeout: 500 })
    advance(499)
    expect(tracker.bubbles).toHaveLength(1)
    advance(1)
    expect(tracker.bubbles).toHaveLength(0)

    tracker.show({ id: 's2', description: 'y', motion: 'success', timeout: 0 })
    advance(20_000)
    expect(tracker.bubbles.map(bubble => bubble.id)).toEqual(['s2'])
  })

  it('空闲会话超时后从会话表沉淀（沉淀后再同档位下发会重新可见）', () => {
    const { tracker, advance } = setup()
    tracker.show({ id: 's', description: '完成', motion: 'success' })
    advance(3100) // 气泡收起
    advance(10_000) // 脉冲窗口过期 → 排沉淀计时
    advance(5000) // IDLE_SESSION_RETENTION 到期 → 会话移除
    tracker.show({ id: 's', description: '完成（新一轮）', motion: 'success' })
    expect(tracker.bubbles).toHaveLength(1)
  })
})
