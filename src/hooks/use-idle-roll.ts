import type { IdleRollPick } from '../config'
import type { Category, PetWeights } from '../types'
import { useEffect, useRef } from 'react'
import { pickIdleRoll } from '../config'

/** 两次掷骰之间的间隔（ms）：与参考实现的 25s~50s 同量级，略微收紧便于观察。 */
export const IDLE_ROLL_DELAY: readonly [number, number] = [20_000, 45_000]

export interface UseIdleRollOptions {
  /** 是否启用（`idleRoll` prop + 配置是否具备素材） */
  enabled: boolean
  /** 当前是否处于「纯待机」（动作是 idle 且没有一次性动画在播） */
  active: boolean
  weights: PetWeights
  turnPool: readonly string[]
  idlePool: readonly string[]
  categories: readonly Category[]
  facing: 'left' | 'right'
  /** 当前正在播的动画名（避免连续重复） */
  current?: string
  reducedMotion: boolean
  /** 掷骰间隔 ms，缺省 `IDLE_ROLL_DELAY` */
  delay?: readonly [number, number]
  /** 命中插播时回调（拿到具体动画名与播放语义） */
  onPick: (pick: IdleRollPick) => void
  random?: () => number
}

/**
 * 空闲掷骰链 —— dsh-pet 的动画链语义：待机不是永远播同一段 idle，而是按
 * `animationWeights` 权重低频掷骰，命中 `turn` 插播转身、命中 `action` 从分类池
 * 抽一个风味动作，其余时间保持循环待机。
 *
 * `move` 档刻意不产生动作：本组件不掌管窗口位置，不做自动漫游（与参考实现
 * 「DSH 不自动漫游而保持待机」的处理一致）；协议字段仍然被解析与使用。
 *
 * 定时器在「纯待机期间」跑，每次可能几十秒；凡是会影响掷骰结果的输入（权重/池/朝向/
 * 当前动画）变化都会重排一次定时器，这是刻意的 —— 换宠物或改配置后不该继续用旧池。
 */
export function useIdleRoll(options: UseIdleRollOptions): void {
  const {
    enabled,
    active,
    weights,
    turnPool,
    idlePool,
    categories,
    facing,
    current,
    reducedMotion,
    delay = IDLE_ROLL_DELAY,
    onPick,
    random,
  } = options

  // 回调与随机源放 ref：它们变化不该重置计时（父组件每次渲染都会新建函数）
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const randomRef = useRef(random)
  randomRef.current = random

  useEffect(() => {
    if (!enabled || !active || reducedMotion)
      return undefined
    if (turnPool.length === 0 && categories.length === 0)
      return undefined

    let timer: number | undefined
    let disposed = false
    const roll = randomRef.current ?? Math.random

    const schedule = () => {
      const span = Math.max(0, delay[1] - delay[0])
      const wait = delay[0] + roll() * span
      timer = window.setTimeout(() => {
        if (disposed)
          return
        const picked = pickIdleRoll({ weights, turnPool, idlePool, categories, facing, current, random: roll })
        if (picked === null) {
          // idle / move / 与当前重复：继续待机并等待下一次掷骰
          schedule()
          return
        }
        onPickRef.current(picked)
      }, wait)
    }

    schedule()

    return () => {
      disposed = true
      if (timer !== undefined)
        window.clearTimeout(timer)
    }
  }, [active, categories, current, delay, enabled, facing, idlePool, reducedMotion, turnPool, weights])
}
