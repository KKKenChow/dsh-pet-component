import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function currentPreference(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  return window.matchMedia(QUERY).matches
}

/**
 * 是否减少动效：读取 `prefers-reduced-motion` 并订阅其变化。
 *
 * @param override 显式覆盖（props.reducedMotion），`undefined` 时用系统偏好
 */
export function useReducedMotion(override?: boolean): boolean {
  const [prefers, setPrefers] = useState(currentPreference)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
      return undefined
    const query = window.matchMedia(QUERY)
    const update = () => setPrefers(query.matches)
    // 首帧的值已由 useState 初始化读取，这里只订阅后续变化（偏好可能在运行中被改）
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return override ?? prefers
}
