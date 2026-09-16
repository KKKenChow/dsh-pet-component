import { describe, expect, it } from 'vitest'
import { Pet, useConfig, useControllablePet } from '../../src/index'

/**
 * 公开入口守卫。
 *
 * `src/index.ts` 只对外暴露三件运行时东西（其余全是类型 re-export）：`<Pet>`、`useConfig`、
 * `useControllablePet`。这条用例既锁 API 面，也让入口文件本身进入覆盖率统计 ——
 * 它只有 re-export，任何测试都不 import 的话会被算成未覆盖。
 */
describe('公开入口', () => {
  it('暴露 <Pet> 与两个 hook', () => {
    expect(typeof Pet).toBe('function')
    expect(typeof useConfig).toBe('function')
    expect(typeof useControllablePet).toBe('function')
  })
})
