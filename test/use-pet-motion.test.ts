import type { PetMotionState } from '../src/hooks/use-pet-motion'
import { describe, expect, it } from 'vitest'
import { retainOverrideOnPropChange } from '../src/hooks/use-pet-motion'

/**
 * 声明层（`motion` prop）与命令面（`pet.motion(...)`）的交班规则。
 *
 * 这条规则只在**跨 React 批次**时才看得出来（见 `src/utils/bubble-tracker.ts` 的
 * `STATUS_COALESCE_MS` 合并窗口）：气泡先更新、命令面发出完成动画，约 100ms 后聚合态
 * 才从工作档掉成待机档。用户报告的「加载 → 完成 / 失败 直接变待机」就是那一刻命令面被清掉。
 * 上游 `deepseek-harness-desktop` 的 `bubble-tracker.ts:38-46` 记录了同一个坑。
 */
describe('retainOverrideOnPropChange', () => {
  it('没有命令面：没有要保留的东西', () => {
    expect(retainOverrideOnPropChange(null)).toBeNull()
  })

  it('循环命令：声明值一变就作废，让 `motion` prop 重新接管', () => {
    const looping: PetMotionState = { type: 'thinking', loop: true, revision: 1 }
    expect(retainOverrideOnPropChange(looping)).toBeNull()
  })

  it('正在播的一次性命令：保留到播完，不被掉档的聚合态掐断', () => {
    const success: PetMotionState = { type: 'success', loop: false, revision: 2 }
    expect(retainOverrideOnPropChange(success)).toBe(success)
  })

  it('失败档同一条规则：动画没播完就不交班', () => {
    const failed: PetMotionState = { type: 'failed', loop: false, revision: 3 }
    expect(retainOverrideOnPropChange(failed)).toBe(failed)
  })
})
