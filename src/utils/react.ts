import { useEffect, useLayoutEffect } from 'react'
import { isBrowser } from './env'

/**
 * SSR 安全的 `useLayoutEffect`：服务端退化为 `useEffect`（服务端渲染时 React 会对
 * `useLayoutEffect` 发警告，且它本来也不会执行）。
 */
export const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect
