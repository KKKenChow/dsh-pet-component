import type { PetConfig, PetConfigSource } from '../types'
import { useEffect, useState } from 'react'
import { loadConfig } from '../utils/fetch'

/** 配置加载状态。 */
export interface PetConfigResult<T> {
  /** 解析好的配置；地址还在路上时是 `null` */
  config: T | null
  /** 加载/解析失败原因 */
  error: Error | null
  /** 地址形态的配置是否仍在加载 */
  loading: boolean
}

interface LoadedState<T> {
  url: string
  config: T | null
  error: Error | null
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * 加载桌宠配置：对象直接使用，字符串地址走 `fetch` + JSONC 解析（带模块级缓存，
 * 同一地址在多个组件实例间只拉一次）。
 *
 * SSR 安全：首帧对地址形态返回 `{ config: null, loading: true }`，不触碰网络；
 * 卸载后不再写状态。对象形态的返回值在渲染期直接派生（不进 effect），
 * 所以「父组件每次渲染都新建配置对象」不会引发额外渲染。
 */
export function useConfig<T extends PetConfig>(source: PetConfigSource): PetConfigResult<T> {
  const url = typeof source === 'string' ? source : null
  const [loaded, setLoaded] = useState<LoadedState<T> | null>(null)

  useEffect(() => {
    if (url === null)
      return undefined
    let cancelled = false
    loadConfig<T>(url)
      .then((config) => {
        if (!cancelled)
          setLoaded({ url, config, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoaded({ url, config: null, error: toError(error) })
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (url === null)
    return { config: source as T, error: null, loading: false }

  if (loaded !== null && loaded.url === url)
    return { config: loaded.config, error: loaded.error, loading: false }

  return { config: null, error: null, loading: true }
}
