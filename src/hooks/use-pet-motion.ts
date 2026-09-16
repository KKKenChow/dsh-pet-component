import type { Ref } from 'react'
import type { MotionInput, PetRef, PetRenderMotion } from '../types'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { isLoopingMotion, PET_DEFAULT_MOTION, PET_FALLBACK_MOTION } from '../config'
import { motionInputKey, normalizeMotionInput } from '../types/motion'

/** 生效中的动作状态。`revision` 每换一次动作就递增（含强制重播）。 */
export interface PetMotionState {
  type: PetRenderMotion
  loop: boolean
  revision: number
}

export interface UsePetMotionOptions {
  /**
   * 声明式动作（props.motion）。它是**回落层**而不是受控值：
   * 命令面下发过的动作优先，直到 `motion` 的取值变化 —— 那时命令面被清掉、prop 重新接管。
   */
  motion?: MotionInput
  /** 命令面 ref（`<Pet ref={...} />` 用的同一个 ref） */
  ref?: Ref<PetRef | null>
  /** 生效动作变化时回调 */
  onMotionChange?: (motion: PetRenderMotion) => void
}

export interface UsePetMotionReturn {
  /** 当前生效的动作状态 */
  state: PetMotionState
  /** 下发动作（`PetRef.motion` 的实现） */
  request: (input: MotionInput) => void
  /** 清除命令面动作，回落 `motion` prop（`PetRef.clear` 的实现） */
  clear: () => void
  /** 一次性动作播完时调用（视频 `ended` / 精灵播完） */
  finish: () => void
}

function toState(input: MotionInput | undefined, revision: number): PetMotionState {
  const type = input === undefined
    ? PET_DEFAULT_MOTION
    : (typeof input === 'string' ? input : input.type)
  const loop = input === undefined
    ? isLoopingMotion(type)
    : normalizeMotionInput(input, isLoopingMotion(type)).loop
  return { type, loop, revision }
}

/**
 * 动作状态机 —— 三个渲染器（`DshPet` / `CodexPet` / `Pet`）共用的唯一动作来源。
 *
 * 优先级（对齐参考实现 `dragHold ? 'dragging' : props.status ?? adHoc?.status ?? override?.status ?? 'idle'`
 * 的层次，但把命令面放在声明式 prop 之上）：
 *
 * ```
 * dragging 手势态（prop，由组件层覆盖）
 *   > 命令面 pet.motion(...)（最后一次下发，直到 motion prop 变化）
 *     > motion prop（声明层）
 *       > idle
 * ```
 *
 * 关键点：**`motion` prop 不会让 `pet.motion(...)` 失效**。命令面下发过的动作持续生效，
 * 直到 `motion` 的取值发生变化 —— 那时命令面被清掉、prop 重新接管。
 * 这样「声明式给一个状态（如会话档位）+ 命令式插播一次性动作（如点击回应）」可以共存。
 *
 * 三条去重/收尾规则：
 * 1. 同一动作 + 同一循环语义重复下发不重播（避免「同一条状态重复到达 → 动画一直从头播」），
 *    要重播请显式 `{ type, replay: true }`；已经播完的一次性动作再次下发会重新播；
 * 2. `loop: false` 的动作播完后经 `finish()` 回落 `idle`；
 * 3. `motion` prop 用内容指纹（`motionInputKey`）比较，对象字面量每次渲染都是新引用，
 *    直接比引用会无限回写。
 */
export function usePetMotion(options: UsePetMotionOptions): UsePetMotionReturn {
  const { motion, ref, onMotionChange } = options

  // 全局单调递增的动作代次：prop 变化与命令面共用
  const revisionRef = useRef(0)
  /** 命令面层（`pet.motion(...)`）；`null` = 没有命令，看 prop */
  const [override, setOverride] = useState<PetMotionState | null>(null)
  /** 声明层（`motion` prop，缺省 idle） */
  const [propState, setPropState] = useState<PetMotionState>(() => toState(motion, 0))
  /** 已播完的 revision（一次性动作收尾后置位；下一次 revision 变化自动失效） */
  const [done, setDone] = useState<number | null>(null)

  const overrideRef = useRef(override)
  overrideRef.current = override
  const doneRef = useRef(done)
  doneRef.current = done

  const propKey = motionInputKey(motion)
  const lastPropKeyRef = useRef(propKey)

  // 声明值变化 → 推进声明层，并清掉命令面：声明值重新接管
  useEffect(() => {
    if (lastPropKeyRef.current === propKey)
      return
    lastPropKeyRef.current = propKey
    revisionRef.current += 1
    setPropState(toState(motion, revisionRef.current))
    // eslint-disable-next-line react/set-state-in-effect -- 声明值变了就作废旧的命令层（否则上一次 pet.motion 会一直压着新的 motion prop），这是「prop 变化重新接管」的全部实现
    setOverride(null)
    // eslint-disable-next-line react/set-state-in-effect -- 换动作要清掉「已播完」标记，否则新动作会被上一轮的收尾状态吃掉
    setDone(null)
  }, [propKey, motion])

  const base = override ?? propState

  const state = useMemo<PetMotionState>(() => {
    if (done !== null && done === base.revision && !base.loop)
      return { type: PET_FALLBACK_MOTION, loop: isLoopingMotion(PET_FALLBACK_MOTION), revision: base.revision }
    return base
  }, [base, done])

  const baseRef = useRef(base)
  baseRef.current = base
  const stateRef = useRef(state)
  stateRef.current = state

  const request = useCallback((input: MotionInput) => {
    const type = typeof input === 'string' ? input : input.type
    const normalized = normalizeMotionInput(input, isLoopingMotion(type))
    const prev = overrideRef.current
    // 已经播完的一次性动作不算「重复下发」：用户再点一次就是要再看一次
    const finished = doneRef.current !== null && prev !== null && doneRef.current === prev.revision

    if (!normalized.replay && !finished && prev !== null && prev.type === normalized.type && prev.loop === normalized.loop)
      return

    revisionRef.current += 1
    const next: PetMotionState = { type: normalized.type, loop: normalized.loop, revision: revisionRef.current }
    overrideRef.current = next
    setOverride(next)
    setDone(null)
  }, [])

  const clear = useCallback(() => {
    // 与参考实现一致：清掉命令面，回落到声明层（没传 `motion` 就是 idle）
    if (overrideRef.current === null)
      return
    overrideRef.current = null
    setOverride(null)
    setDone(null)
  }, [])

  const finish = useCallback(() => {
    const current = baseRef.current
    if (current.loop)
      return
    setDone(current.revision)
  }, [])

  // 渲染器只实现动作三项 —— `bubble` / `muttering` 由 `Pet` 组合到公开句柄上
  // （见 `src/components/pet.tsx`）：一个 ref 只能被一处 `useImperativeHandle` 写，
  // 所以这里交出的是「动作子集」，公开的 `PetRef` 由 `Pet` 一次性交出。
  useImperativeHandle(ref, () => ({
    motion: request,
    clear,
    get current() {
      return stateRef.current.type
    },
  } as PetRef), [request, clear])

  const lastNotifiedRef = useRef(state.type)
  useEffect(() => {
    if (lastNotifiedRef.current === state.type)
      return
    lastNotifiedRef.current = state.type
    onMotionChange?.(state.type)
  }, [state.type, onMotionChange])

  return { state, request, clear, finish }
}
