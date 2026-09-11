import type { RefObject } from 'react'
import type { PetRef } from '../types'
import { useRef } from 'react'

/**
 * 桌宠的命令面 —— 把 ref 上的 `motion` / `clear` 包成一个稳定对象，
 * 调用方不接触资源、帧循环或动画结束事件。
 *
 * ```tsx
 * const petRef = useRef<PetRef>(null)
 * const pet = useControllablePet(petRef)
 *
 * pet.motion({ type: 'thinking', loop: true }) // 思考动作，循环播放
 * pet.motion({ type: 'result' })               // 结果动作，播一次后自动回 idle
 * pet.clear()                                  // 清除当前动作，切换为 idle
 *
 * return <Pet ref={petRef} config={…} uri={…} />
 * ```
 *
 * ref 命令优先于 `motion` prop 之外的内部状态；只要组件上还传着 `motion` prop，
 * 画面就由 prop 决定（React 受控组件的常规语义）。
 *
 * @param petRef 传给 `<Pet ref={…} />` 的同一个 ref
 * @returns 稳定的命令面（同一实例内引用不变，可安全放进依赖数组）
 */
export function useControllablePet(petRef?: RefObject<PetRef | null>): PetRef {
  const handleRef = useRef<PetRef | null>(null)
  if (handleRef.current === null) {
    handleRef.current = {
      motion(motion) {
        petRef?.current?.motion(motion)
      },
      clear() {
        petRef?.current?.clear()
      },
      get current() {
        return petRef?.current?.current ?? 'idle'
      },
    }
  }
  return handleRef.current
}
