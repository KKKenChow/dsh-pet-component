/**
 * React 值源工具 —— `RefOrValue` / `toValue` / `isRef`，与 `@reaxuse/shared`
 * 的同名工具语义一致（上游是 Vue 的 `MaybeRefOrGetter` + `toValue`）。
 *
 * 为什么内置：`src/hooks/use-media-controls.ts` 的 `target` 参数用的是这套
 * 「值 or ref or getter」约定，而 `@reaxuse/shared` 尚未在本包落地依赖。
 */
import { useEffect, useLayoutEffect } from 'react'

/** 值本身、`{ current }` 容器（React ref / `useRef`）或 getter 函数。 */
export type RefOrValue<T> = T | { current: T } | (() => T)

/** 是否为 `{ current }` 容器（React ref 形状）。 */
export function isRef<T = unknown>(value: unknown): value is { current: T } {
  return typeof value === 'object' && value !== null && 'current' in value
}

/**
 * 把值源解成本次调用真正要用的值：getter 先调用，`{ current }` 取 `.current`，
 * 其余原样返回。**每次调用都重新读取**，所以对「挂载后才填好的 ref」天然友好。
 */
export function toValue<T>(source: RefOrValue<T>): T {
  if (typeof source === 'function')
    return (source as () => T)()
  if (isRef<T>(source))
    return source.current
  return source as T
}

/** 是否在浏览器环境（SSR 下为 `false`）。 */
export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

/** 是否为非 `null` 的普通对象（数组、函数、`null` 均返回 `false`）。 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * SSR 安全的 `useLayoutEffect`：服务端退化为 `useEffect`（服务端渲染时 React 会对
 * `useLayoutEffect` 发警告，且它本来也不会执行）。
 */
export const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect
