import { describe, expect, it } from 'vitest'
import {
  BUBBLE_MOTION_PRIORITY,
  BUBBLE_TERMINAL_PULSE_TTL,
  BUBBLE_TERMINAL_TIMEOUT,
  createBubble,
  hasPulseWindow,
  isTerminalMotion,
  MAX_VISIBLE_BUBBLES,
  motionKey,
  motionType,
  resolveBubbleTimeout,
  resolveBubbleVariant,
  terminalPulseTtlOf,
  terminalTimeoutOf,
  updateBubble,
} from '../src/utils/bubble'

/* -------------------------------------------------------------------------- */
/* 常量表（逐值对齐参考实现）                                                    */
/* -------------------------------------------------------------------------- */

describe('常量表', () => {
  it('终态档的自动收起时长 = scheduleHide 的三个常量', () => {
    expect(BUBBLE_TERMINAL_TIMEOUT).toEqual({ failed: 4000, error: 4000, review: 2500, success: 3000 })
    expect(MAX_VISIBLE_BUBBLES).toBe(3)
  })

  it('终态档的聚合保持窗口 = FAILED_PULSE_TTL / TERMINAL_PULSE_TTL', () => {
    expect(BUBBLE_TERMINAL_PULSE_TTL).toEqual({ failed: 10000, error: 10000, success: 10000 })
  })

  it('优先级表覆盖 15 个动作槽（14 动作 + 手势态 dragging）', () => {
    expect(Object.keys(BUBBLE_MOTION_PRIORITY)).toHaveLength(15)
    expect(BUBBLE_MOTION_PRIORITY.waiting).toBe(60)
    expect(BUBBLE_MOTION_PRIORITY.error).toBe(50)
    expect(BUBBLE_MOTION_PRIORITY.failed).toBe(45)
    expect(BUBBLE_MOTION_PRIORITY.review).toBe(40)
    expect(BUBBLE_MOTION_PRIORITY.working).toBe(30)
    expect(BUBBLE_MOTION_PRIORITY.success).toBe(10)
    expect(BUBBLE_MOTION_PRIORITY.idle).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 档位判定                                                                     */
/* -------------------------------------------------------------------------- */

describe('档位判定', () => {
  it('motionType 归一化字符串 / 对象两种入参', () => {
    expect(motionType('thinking')).toBe('thinking')
    expect(motionType({ type: 'thinking' })).toBe('thinking')
    expect(motionType(undefined)).toBeUndefined()
  })

  it('motionKey 忽略 replay、区分循环语义', () => {
    expect(motionKey('thinking')).toBe('thinking')
    expect(motionKey({ type: 'thinking', replay: true })).toBe('thinking')
    expect(motionKey('thinking')).not.toBe(motionKey({ type: 'thinking', loop: false }))
    expect(motionKey(undefined)).toBeUndefined()
  })

  it('终态档 = 会自己收起的那四档；脉冲窗口只有三档（review 不在内）', () => {
    for (const motion of ['failed', 'review', 'error', 'success'] as const)
      expect(isTerminalMotion(motion)).toBe(true)
    for (const motion of ['thinking', 'working', 'result', 'waiting', 'running', 'idle'] as const)
      expect(isTerminalMotion(motion)).toBe(false)
    expect(isTerminalMotion(undefined)).toBe(false)

    expect(hasPulseWindow('failed')).toBe(true)
    expect(hasPulseWindow('error')).toBe(true)
    expect(hasPulseWindow('success')).toBe(true)
    // review 有 2.5s 收起时长，但没有聚合窗口 —— 与其他会话并存时照常参与聚合
    expect(hasPulseWindow('review')).toBe(false)
    expect(terminalPulseTtlOf('review')).toBe(0)
    expect(terminalPulseTtlOf('failed')).toBe(10000)
    expect(terminalPulseTtlOf('success')).toBe(10000)
  })

  it('terminalTimeoutOf 只对终态档给时长', () => {
    expect(terminalTimeoutOf('success')).toBe(3000)
    expect(terminalTimeoutOf('failed')).toBe(4000)
    expect(terminalTimeoutOf('review')).toBe(2500)
    expect(terminalTimeoutOf('waiting')).toBeUndefined()
    expect(terminalTimeoutOf('thinking')).toBeUndefined()
    expect(terminalTimeoutOf(undefined)).toBeUndefined()
  })
})

/* -------------------------------------------------------------------------- */
/* 时长解析（宿主 timeout 优先，其次按**档位**而不是语义色）                       */
/* -------------------------------------------------------------------------- */

describe('resolveBubbleTimeout', () => {
  it('缺省按档位取值：只有终态档会自己收', () => {
    expect(resolveBubbleTimeout({ motion: 'success' })).toBe(3000)
    expect(resolveBubbleTimeout({ motion: 'failed' })).toBe(4000)
    expect(resolveBubbleTimeout({ motion: 'error' })).toBe(4000)
    expect(resolveBubbleTimeout({ motion: 'review' })).toBe(2500)
    // 工作档 / 等待档常驻：等状态自己变化（「更新为警告不该自动消失」的根据）
    expect(resolveBubbleTimeout({ motion: 'thinking' })).toBe(0)
    expect(resolveBubbleTimeout({ motion: 'waiting' })).toBe(0)
    expect(resolveBubbleTimeout({})).toBe(0)
  })

  it('显式 timeout 优先；非正数 / 非数字一律当常驻', () => {
    expect(resolveBubbleTimeout({ motion: 'success', timeout: 1234 })).toBe(1234)
    expect(resolveBubbleTimeout({ motion: 'success', timeout: 0 })).toBe(0)
    expect(resolveBubbleTimeout({ motion: 'thinking', timeout: -1 })).toBe(0)
    expect(resolveBubbleTimeout({ motion: 'success', timeout: Number.NaN })).toBe(0)
  })
})

describe('resolveBubbleVariant', () => {
  it('加载态就是 Info 档（对齐 toastContent：isLoading 只出现在 default 档位）', () => {
    expect(resolveBubbleVariant(true, undefined, 'warning')).toBe('default')
    expect(resolveBubbleVariant(true, undefined, 'success')).toBe('default')
    // 显式给的语义色仍然优先
    expect(resolveBubbleVariant(true, 'danger', 'default')).toBe('danger')
    // 非加载态：保持上一条
    expect(resolveBubbleVariant(false, undefined, 'warning')).toBe('warning')
  })
})

/* -------------------------------------------------------------------------- */
/* 单条条目的补齐与原地更新                                                     */
/* -------------------------------------------------------------------------- */

describe('createBubble / updateBubble', () => {
  it('补齐默认值：loading 假、placement top、kind bubble、常驻', () => {
    expect(createBubble({ description: '你好' }, 'a', 1)).toMatchObject({
      id: 'a',
      description: '你好',
      created: 1,
      loading: false,
      placement: 'top',
      kind: 'bubble',
      variant: 'default',
      duration: 0,
    })
  })

  it('加载态气泡缺省就是 Info 档且常驻（不引终态时长）', () => {
    const bubble = createBubble({ description: '处理中', loading: true, motion: 'thinking' }, 'a', 1)
    expect(bubble).toMatchObject({ variant: 'default', loading: true, duration: 0 })
  })

  it('原地更新：只换本次显式给出的字段，id / created 与未给出的字段保持不变', () => {
    const first = createBubble(
      { id: 'a', description: '正在处理', loading: true, motion: 'thinking', variant: 'warning' },
      'a',
      3,
    )
    const next = updateBubble(first, { description: '已完成' })
    expect(next.id).toBe('a')
    expect(next.created).toBe(3)
    expect(next.description).toBe('已完成')
    // 加载态没被清掉：语义色回到 Info 档（本次没显式给 variant）
    expect(next.variant).toBe('default')
    expect(next.motion).toBe('thinking')
    expect(next.duration).toBe(first.duration)
  })

  it('显式 undefined = 清除（与追踪器的会话快照合并同一套语义）', () => {
    const first = createBubble({ description: 'x', image: '/a.png', icon: 'i' }, 'a', 1)
    const next = updateBubble(first, { image: undefined })
    expect(next.image).toBeUndefined()
    expect(next.icon).toBe('i')
  })

  it('档位换了才按时长表重算（转入终态档才排计时器）', () => {
    const loading = createBubble({ description: 'x', loading: true, motion: 'thinking' }, 'a', 1)
    expect(loading.duration).toBe(0)
    // 转入 success → 3s 后自己收
    expect(updateBubble(loading, { description: 'y', loading: false, motion: 'success' }).duration).toBe(3000)
    // 转入 waiting（等待档）→ 仍然常驻，不该莫名开始倒计时
    expect(updateBubble(loading, { description: 'y', variant: 'warning', motion: 'waiting' }).duration).toBe(0)
    // 转入 failed → 4s
    expect(updateBubble(loading, { description: 'y', motion: 'failed' }).duration).toBe(4000)
  })

  it('档位没变又不给 timeout → 时长不动（换文字不重置收起）', () => {
    const success = createBubble({ description: 'x', motion: 'success' }, 'a', 1)
    expect(success.duration).toBe(3000)
    expect(updateBubble(success, { description: 'y' }).duration).toBe(3000)
    expect(updateBubble(success, { description: 'y', timeout: 500 }).duration).toBe(500)
    expect(updateBubble(success, { description: 'y', timeout: 0 }).duration).toBe(0)
  })
})
