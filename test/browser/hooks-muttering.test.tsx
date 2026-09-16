import type { PetMutteringEvent, PetMutteringHandler } from '../../src/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from 'vitest-browser-react'
import { createMutteringController, useMuttering } from '../../src/hooks/use-muttering'

/**
 * 碎碎念触发链的真浏览器行为 —— 周期、首拍基线、手动索取、挂起门控、配图抽取。
 *
 * 周期用假定时器推进（`useIntervalFn` 走 `setInterval`，所以两个都假），
 * 真实渲染由 React 负责。断言一律落在「宿主看到的东西」上：`onMuttering` 的事件、
 * `onPlay` 的动画名、`onShow` 的文本与时长。
 */

interface MutteringHarnessOptions {
  onMuttering?: PetMutteringHandler
  onPlay?: (name?: string) => void
  onShow?: (text: string, options: { image?: string, duration: number }) => void
  enabled?: boolean
  immediate?: boolean
  suspended?: boolean
  intervalSec?: number
  duration?: number
  image?: boolean
  memes?: Record<string, string>
  whisperPool?: readonly string[]
  random?: () => number
  petId?: string
  prompt?: string
}

/**
 * 固定选项的渲染入口。
 *
 * 注意：`options` 是**调用时**的快照，运行中要改开关（`enabled` / `suspended`）必须用
 * `renderLiveMuttering(() => ({...}))`，否则渲染回调读到的永远是首次那份。
 */
function renderMuttering(options: MutteringHarnessOptions = {}) {
  return renderLiveMuttering(() => options)
}

/** 每次渲染都重新求值选项：给「运行中改开关」的用例用。 */
function renderLiveMuttering(getOptions: () => MutteringHarnessOptions) {
  return renderHook(() => useMuttering({
    enabled: true,
    prompt: '说一句碎碎念',
    intervalSec: 1,
    immediate: false,
    petId: 'p1',
    duration: 10_000,
    image: false,
    onPlay: () => {},
    onShow: () => {},
    ...getOptions(),
  }))
}

describe('useMuttering', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('首拍只记基线：通知宿主，但期间推回的文本被丢弃', async () => {
    const prompts: string[] = []
    const events: PetMutteringEvent[] = []
    const played: (string | undefined)[] = []
    const shown: string[] = []

    const view = await renderMuttering({
      whisperPool: ['碎碎念甲'],
      onMuttering: (prompt, event) => {
        prompts.push(prompt)
        events.push(event)
      },
      onPlay: name => played.push(name),
      onShow: text => shown.push(text),
    })

    expect(prompts).toEqual(['说一句碎碎念'])
    expect(events[0]?.reason).toBe('baseline')
    expect(events[0]?.petId).toBe('p1')
    expect(events[0]?.intervalSec).toBe(1)
    expect(events[0]?.meme).toBeUndefined()

    // 基线窗口内推回文本：只记基线不展示
    await view.act(() => {
      view.result.current.handle('基线窗口里的')
    })
    expect(played).toEqual([])
    expect(shown).toEqual([])
  })

  it('周期到点按 intervalSec 通知宿主（reason: tick）', async () => {
    const events: PetMutteringEvent[] = []
    const view = await renderMuttering({
      onMuttering: (_prompt, event) => events.push(event),
    })
    expect(events.map(event => event.reason)).toEqual(['baseline'])

    await view.act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(events.map(event => event.reason)).toEqual(['baseline', 'tick'])

    await view.act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(events.map(event => event.reason)).toEqual(['baseline', 'tick', 'tick'])
  })

  it('推回文本：抽动画 + 弹气泡（时长透传）', async () => {
    const played: (string | undefined)[] = []
    const shown: { text: string, image?: string, duration: number }[] = []
    const view = await renderMuttering({
      duration: 4000,
      whisperPool: ['碎碎念甲'],
      onPlay: name => played.push(name),
      onShow: (text, options) => shown.push({ text, ...options }),
    })

    await view.act(() => {
      view.result.current.handle('基线窗口里的')
    })
    expect(shown).toEqual([])

    await view.act(() => {
      view.result.current.handle('第一句')
    })
    expect(played).toEqual(['碎碎念甲'])
    expect(shown).toEqual([{ text: '第一句', duration: 4000 }])
  })

  it('动画池为空时 onPlay 收到 undefined（调用方自行回落）', async () => {
    const played: (string | undefined)[] = []
    const view = await renderMuttering({ onPlay: name => played.push(name) })

    await view.act(() => {
      view.result.current.handle.request()
    })
    await view.act(() => {
      view.result.current.handle('没有池子')
    })
    expect(played).toEqual([undefined])
  })

  it('动画池里避开上一次抽中的那段', async () => {
    const played: (string | undefined)[] = []
    const view = await renderMuttering({
      whisperPool: ['甲', '乙'],
      random: () => 0,
      onPlay: name => played.push(name),
    })

    await view.act(() => {
      view.result.current.handle.request()
    })
    await view.act(() => {
      view.result.current.handle('一')
    })
    await view.act(() => {
      view.result.current.handle('二')
    })
    expect(played).toEqual(['甲', '乙'])
  })

  it('request() 立即索取（reason: manual），并清掉首拍基线窗口', async () => {
    const events: PetMutteringEvent[] = []
    const shown: string[] = []
    const view = await renderMuttering({
      onMuttering: (_prompt, event) => events.push(event),
      onShow: text => shown.push(text),
    })
    expect(events.map(event => event.reason)).toEqual(['baseline'])

    await view.act(() => {
      view.result.current.handle.request()
    })
    expect(events.map(event => event.reason)).toEqual(['baseline', 'manual'])

    // 手动索取清掉了基线窗口：此后推回的文本要展示
    await view.act(() => {
      view.result.current.handle('马上说')
    })
    expect(shown).toEqual(['马上说'])
  })

  it('挂起（有加载态气泡）时周期不触发，手动索取仍然可用', async () => {
    let suspended = true
    const events: PetMutteringEvent[] = []
    const view = await renderLiveMuttering(() => ({
      suspended,
      onMuttering: (_prompt, event) => events.push(event),
    }))

    // 挂起期间连首拍都不发
    expect(events).toEqual([])
    await view.act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(events).toEqual([])

    await view.act(() => {
      view.result.current.handle.request()
    })
    expect(events.map(event => event.reason)).toEqual(['manual'])

    suspended = false
    await view.rerender()
    // 恢复后的第一次周期仍然只记基线（手动触发没有推进 started）
    await view.act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(events.map(event => event.reason)).toEqual(['manual', 'baseline'])
  })

  it('image + memes：事件里带上抽中的表情包', async () => {
    const events: PetMutteringEvent[] = []
    await renderMuttering({
      image: true,
      memes: { 开心: '笑一个', 发呆: '放空' },
      random: () => 0,
      onMuttering: (_prompt, event) => events.push(event),
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.meme).toEqual({ name: '开心', desc: '笑一个' })
  })

  it('image 打开但没有配图池：meme 为 undefined', async () => {
    const events: PetMutteringEvent[] = []
    await renderMuttering({
      image: true,
      memes: {},
      onMuttering: (_prompt, event) => events.push(event),
    })

    expect(events[0]?.meme).toBeUndefined()
  })

  it('immediate: true 首拍即索取，不算基线', async () => {
    const events: PetMutteringEvent[] = []
    const shown: string[] = []
    const view = await renderMuttering({
      immediate: true,
      onMuttering: (_prompt, event) => events.push(event),
      onShow: text => shown.push(text),
    })
    expect(events.map(event => event.reason)).toEqual(['tick'])

    // 不在基线窗口：推回的文本直接展示
    await view.act(() => {
      view.result.current.handle('直接说')
    })
    expect(shown).toEqual(['直接说'])
  })

  it('enabled: false 时既不发首拍也不排周期', async () => {
    const events: PetMutteringEvent[] = []
    const view = await renderMuttering({
      enabled: false,
      onMuttering: (_prompt, event) => events.push(event),
    })
    expect(events).toEqual([])

    await view.act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(events).toEqual([])
  })

  it('enabled 重新打开会重新发首拍基线', async () => {
    let enabled = false
    const events: PetMutteringEvent[] = []
    const view = await renderLiveMuttering(() => ({
      enabled,
      onMuttering: (_prompt, event) => events.push(event),
    }))
    expect(events).toEqual([])

    enabled = true
    await view.rerender()
    expect(events.map(event => event.reason)).toEqual(['baseline'])
  })

  it('没有 onMuttering 时周期照跑但静默', async () => {
    const view = await renderMuttering({ intervalSec: 1 })

    await view.act(() => {
      vi.advanceTimersByTime(3000)
    })
    // 没有回调可观察，只守「不抛错、周期还在」
    expect(view.result.current.handle).toBeDefined()
  })

  it('宿主回调抛错只 warn，周期不被打断', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const reasons: string[] = []
      const view = await renderMuttering({
        onMuttering: (_prompt, event) => {
          reasons.push(event.reason)
          throw new Error('宿主炸了')
        },
      })

      expect(warn).toHaveBeenCalledTimes(1)
      await view.act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(reasons).toEqual(['baseline', 'tick'])
    }
    finally {
      warn.mockRestore()
    }
  })

  it('空白文本直接丢弃', async () => {
    const played: (string | undefined)[] = []
    const shown: string[] = []
    const view = await renderMuttering({
      whisperPool: ['甲'],
      onPlay: name => played.push(name),
      onShow: text => shown.push(text),
    })

    await view.act(() => {
      view.result.current.handle.request()
    })
    await view.act(() => {
      view.result.current.handle('   ')
    })
    expect(played).toEqual([])
    expect(shown).toEqual([])
  })

  it('卸载后周期不再触发', async () => {
    const events: PetMutteringEvent[] = []
    const view = await renderMuttering({
      onMuttering: (_prompt, event) => events.push(event),
    })
    expect(events).toHaveLength(1)

    await view.unmount()
    vi.advanceTimersByTime(5000)
    expect(events).toHaveLength(1)
  })

  it('卸载后再调命令面是空操作', async () => {
    const events: PetMutteringEvent[] = []
    const shown: string[] = []
    const view = await renderMuttering({
      onMuttering: (_prompt, event) => events.push(event),
      onShow: text => shown.push(text),
    })
    const handle = view.result.current.handle

    await view.unmount()
    expect(() => handle('卸载之后')).not.toThrow()
    expect(() => handle.request()).not.toThrow()
    expect(shown).toEqual([])
    expect(events.map(event => event.reason)).toEqual(['baseline'])
  })

  it('配置变化重建控制器时不会再发一次首拍', async () => {
    let intervalSec = 1
    const events: PetMutteringEvent[] = []
    const view = await renderLiveMuttering(() => ({
      intervalSec,
      onMuttering: (_prompt, event) => events.push(event),
    }))
    expect(events.map(event => event.reason)).toEqual(['baseline'])

    // intervalSec 进了 useMemo 依赖 → 控制器重建；但首拍只该发过一次
    intervalSec = 5
    await view.rerender()
    expect(events.map(event => event.reason)).toEqual(['baseline'])
  })

  it('命令面引用稳定，可安全放进依赖数组', async () => {
    const view = await renderMuttering()
    const handle = view.result.current.handle

    await view.rerender()
    expect(view.result.current.handle).toBe(handle)
  })
})

/**
 * 控制器本身是纯逻辑（`src/hooks/use-muttering.ts` 的导出），顺手把只有它才暴露的
 * `baselinePending` 也锁住 —— 它是「首拍窗口」的唯一可观测面。
 */
describe('createMutteringController', () => {
  it('baselinePending 暴露首拍基线窗口', () => {
    const controller = createMutteringController({
      enabled: true,
      prompt: '说一句碎碎念',
      intervalSec: 300,
      immediate: false,
      duration: 10_000,
      image: false,
      onPlay: () => {},
      onShow: () => {},
    })

    expect(controller.baselinePending).toBe(false)
    controller.tick() // 首拍：进入基线窗口
    expect(controller.baselinePending).toBe(true)
    controller.show('基线窗口里的') // 丢弃并关窗
    expect(controller.baselinePending).toBe(false)
  })
})
