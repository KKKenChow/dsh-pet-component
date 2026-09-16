import type { PetMutteringEvent } from '../src/types'
import { describe, expect, it } from 'vitest'
import { pickMeme, pickWhisperAnimation } from '../src/config'

/* -------------------------------------------------------------------------- */
/* 配图：随机抽 1 张（与 dsh-pet 一致 —— 不让模型选）                             */
/* -------------------------------------------------------------------------- */

describe('pickMeme', () => {
  it('未配置 / 空表 / 全是空白键 → undefined', () => {
    expect(pickMeme(undefined)).toBeUndefined()
    expect(pickMeme({})).toBeUndefined()
    expect(pickMeme({ '  ': '空白键' })).toBeUndefined()
  })

  it('随机抽 1 张并带上描述', () => {
    const memes = { 开心: '笑得很开心', 生气: '气鼓鼓' }
    expect(pickMeme(memes, () => 0)).toEqual({ name: '开心', desc: '笑得很开心' })
    expect(pickMeme(memes, () => 0.99)).toEqual({ name: '生气', desc: '气鼓鼓' })
  })

  it('描述为空串时原样返回（不编造文案）', () => {
    expect(pickMeme({ 图: '' }, () => 0)).toEqual({ name: '图', desc: '' })
  })
})

/* -------------------------------------------------------------------------- */
/* 碎碎念动画：`animations.events.whisper` 整池随机抽（不给 tier）               */
/* -------------------------------------------------------------------------- */

describe('pickWhisperAnimation', () => {
  const animations = { events: { whisper: ['碎碎念-擦桌', '碎碎念-发呆'] } }

  it('从整池抽一段', () => {
    expect(pickWhisperAnimation(animations, undefined, () => 0)).toBe('碎碎念-擦桌')
    expect(pickWhisperAnimation(animations, undefined, () => 0.99)).toBe('碎碎念-发呆')
  })

  it('避开当前正播的那段（避免连续重复）', () => {
    expect(pickWhisperAnimation(animations, '碎碎念-擦桌', () => 0)).toBe('碎碎念-发呆')
    // 池里只有一段时宁可重复也不返回空
    expect(pickWhisperAnimation({ events: { whisper: ['唯一'] } }, '唯一', () => 0)).toBe('唯一')
  })

  it('池为空 / 没有 events 段 / 配置缺失 → undefined（调用方回落 waving）', () => {
    expect(pickWhisperAnimation({}, undefined, () => 0)).toBeUndefined()
    expect(pickWhisperAnimation({ events: { whisper: [] } }, undefined, () => 0)).toBeUndefined()
    expect(pickWhisperAnimation(undefined, undefined, () => 0)).toBeUndefined()
  })

  it('事件载荷形状：meme 只有 name / desc', () => {
    const event: PetMutteringEvent = {
      petId: 'main',
      reason: 'tick',
      intervalSec: 300,
      meme: { name: '开心', desc: '笑得很开心' },
    }
    expect(Object.keys(event.meme ?? {})).toEqual(['name', 'desc'])
  })
})
