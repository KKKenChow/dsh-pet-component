import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBubbleQueue } from '../src/hooks/use-pet-bubbles'
import {
  BUBBLE_DEFAULT_TIMEOUT,
  createBubble,
  MAX_VISIBLE_BUBBLES,
  resolveBubbleTimeout,
  updateBubble,
} from '../src/utils/bubble'

/* -------------------------------------------------------------------------- */
/* 时长默认值（对齐 desktop 的四个常量）                                        */
/* -------------------------------------------------------------------------- */

describe('resolveBubbleTimeout', () => {
  it('缺省按语义色取值', () => {
    expect(BUBBLE_DEFAULT_TIMEOUT).toEqual({ default: 0, success: 3000, warning: 2500, danger: 4000 })
    expect(resolveBubbleTimeout('default')).toBe(0)
    expect(resolveBubbleTimeout('success')).toBe(3000)
    expect(resolveBubbleTimeout('warning')).toBe(2500)
    expect(resolveBubbleTimeout('danger')).toBe(4000)
  })

  it('显式 timeout 优先；非正数 / 非数字一律当常驻（不猜一个默认时长）', () => {
    expect(resolveBubbleTimeout('success', 1234)).toBe(1234)
    expect(resolveBubbleTimeout('success', 0)).toBe(0)
    expect(resolveBubbleTimeout('success', -1)).toBe(0)
    expect(resolveBubbleTimeout('success', Number.NaN)).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 单条气泡的补齐与原地更新                                                     */
/* -------------------------------------------------------------------------- */

describe('createBubble / updateBubble', () => {
  it('补齐默认值：loading 假、restore 真、placement top、kind bubble', () => {
    expect(createBubble({ description: '你好' }, 'a', 1)).toMatchObject({
      id: 'a',
      description: '你好',
      created: 1,
      loading: false,
      restore: true,
      placement: 'top',
      kind: 'bubble',
      variant: 'default',
      duration: 0,
    })
  })

  it('原地更新只换本次显式给出的字段，id / created 与未给出的字段保持不变', () => {
    const first = createBubble(
      { id: 'a', description: '正在处理', loading: true, motion: 'thinking', variant: 'warning' },
      'a',
      3,
    )
    const next = updateBubble(first, { description: '已完成', loading: false })
    expect(next.id).toBe('a')
    expect(next.created).toBe(3)
    expect(next.description).toBe('已完成')
    expect(next.loading).toBe(false)
    // 没给的字段（捆绑动画、语义色、时长）一律保持原值
    expect(next.motion).toBe('thinking')
    expect(next.variant).toBe('warning')
    expect(next.duration).toBe(first.duration)
  })

  it('只有显式给 timeout 才重算时长', () => {
    const first = createBubble({ description: 'x', variant: 'success' }, 'a', 1)
    expect(first.duration).toBe(3000)
    expect(updateBubble(first, { description: 'y' }).duration).toBe(3000)
    expect(updateBubble(first, { description: 'y', timeout: 500 }).duration).toBe(500)
  })
})

/* -------------------------------------------------------------------------- */
/* 队列：叠加 / 原地更新 / 定时收起 / 上限淘汰                                   */
/* -------------------------------------------------------------------------- */

describe('createBubbleQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('新气泡追加在末尾（渲染时最新的一条最靠近宠物）', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'a' })
    queue.show({ id: 'b', description: 'b' })
    expect(queue.list.map(bubble => bubble.id)).toEqual(['a', 'b'])
  })

  it('同 id 再次下发 = 原地更新（不新增条目，也不重新淡入）', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 's1', description: '正在处理', loading: true, motion: 'thinking' })
    queue.show({ id: 's1', description: '已完成', loading: false })
    expect(queue.list).toHaveLength(1)
    expect(queue.list[0]).toMatchObject({ description: '已完成', loading: false, motion: 'thinking' })
  })

  it('缺省 id 自增且带前缀（避免与宿主的 id 撞车）', () => {
    const queue = createBubbleQueue()
    const first = queue.show({ description: 'a' })
    const second = queue.show({ description: 'b' })
    expect(first).not.toBe(second)
    expect(first.startsWith('dsh-pet-bubble-')).toBe(true)
  })

  it('超过上限关最旧并回调 onClose（对齐 desktop MAX_VISIBLE_TOASTS = 3）', () => {
    expect(MAX_VISIBLE_BUBBLES).toBe(3)
    const closed: string[] = []
    const queue = createBubbleQueue({ onClose: bubble => closed.push(bubble.id) })
    for (const id of ['a', 'b', 'c', 'd'])
      queue.show({ id, description: id })
    expect(queue.list.map(bubble => bubble.id)).toEqual(['b', 'c', 'd'])
    expect(closed).toEqual(['a'])
  })

  it('onShow 只在创建时回调一次（原地更新不再回调，捆绑动画因此不会重放）', () => {
    const shown: string[] = []
    const queue = createBubbleQueue({ onShow: bubble => shown.push(bubble.id) })
    queue.show({ id: 'a', description: 'a', motion: 'thinking' })
    queue.show({ id: 'a', description: 'b' })
    expect(shown).toEqual(['a'])
  })

  it('close() 缺省收起最近一次创建/更新的那条', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'a' })
    queue.show({ id: 'b', description: 'b' })
    queue.show({ id: 'a', description: 'a2' })
    queue.close()
    expect(queue.list.map(bubble => bubble.id)).toEqual(['b'])
  })

  it('close(id) 只收指定那条，clear() 收全部', () => {
    const closed: string[] = []
    const queue = createBubbleQueue({ onClose: bubble => closed.push(bubble.id) })
    queue.show({ id: 'a', description: 'a' })
    queue.show({ id: 'b', description: 'b' })
    queue.close('a')
    expect(queue.list.map(bubble => bubble.id)).toEqual(['b'])
    queue.clear()
    expect(queue.list).toHaveLength(0)
    expect(closed).toEqual(['a', 'b'])
  })

  it('到点自动收起', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'a', timeout: 3000 })
    vi.advanceTimersByTime(2999)
    expect(queue.list).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(queue.list).toHaveLength(0)
  })

  it('同 id 更新不重置自动收起计时（可更新文字不打断收起）', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'x', timeout: 3000 })
    vi.advanceTimersByTime(2000)
    queue.show({ id: 'a', description: 'y' })
    vi.advanceTimersByTime(999)
    expect(queue.list).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(queue.list).toHaveLength(0)
  })

  it('显式给 timeout 才重排计时', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'x', timeout: 3000 })
    vi.advanceTimersByTime(2000)
    queue.show({ id: 'a', description: 'y', timeout: 3000 })
    vi.advanceTimersByTime(2000)
    expect(queue.list).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(queue.list).toHaveLength(0)
  })

  it('update 把 timeout 改成 0 = 取消自动收起', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'x', timeout: 3000 })
    queue.show({ id: 'a', description: 'y', timeout: 0 })
    vi.advanceTimersByTime(10_000)
    expect(queue.list).toHaveLength(1)
  })

  it('dispose 释放定时器并清空队列', () => {
    const queue = createBubbleQueue()
    queue.show({ id: 'a', description: 'a', timeout: 3000 })
    queue.dispose()
    expect(queue.list).toHaveLength(0)
    // 释放后再推进时间不会抛（定时器已被取消）
    vi.advanceTimersByTime(5000)
    expect(queue.list).toHaveLength(0)
  })

  it('onChange 在每次内容变化后回调当前队列', () => {
    const snapshots: string[][] = []
    const queue = createBubbleQueue({ onChange: bubbles => snapshots.push(bubbles.map(bubble => bubble.id)) })
    queue.show({ id: 'a', description: 'a' })
    queue.show({ id: 'a', description: 'a2' })
    queue.close('a')
    expect(snapshots).toEqual([['a'], ['a'], []])
  })
})
