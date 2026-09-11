import type { PetConfigSource } from '../types'
import { parseJsonc } from './jsonc'

/**
 * 配置文件加载：`config` prop 可以是对象，也可以是 `.json` / `.jsonc` 地址。
 *
 * 地址形态走 `fetch` + `parseJsonc`（剥注释 / 去尾逗号），并按 URL 做模块级 promise
 * 去重——同一地址在多个宠物实例间只拉一次；失败时把缓存项删掉，允许重试。
 */
const configCache = new Map<string, Promise<unknown>>()

/** `fetch` 文本并校验状态码。 */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, init)
  if (!response.ok)
    throw new Error(`Failed to fetch config ${url}: HTTP ${response.status} ${response.statusText}`)
  return response.text()
}

/** 加载配置：对象原样返回，地址走带缓存的 JSONC 拉取。 */
export function loadConfig<T>(source: T | string): Promise<T> {
  if (typeof source !== 'string')
    return Promise.resolve(source as T)

  const cached = configCache.get(source)
  if (cached !== undefined)
    return cached as Promise<T>

  const task = fetchText(source)
    .then(text => parseJsonc<T>(text))
    .catch((error) => {
      configCache.delete(source)
      throw error
    })

  configCache.set(source, task as Promise<unknown>)
  return task
}

/** 清配置缓存（给测试与「配置热更新」用）。 */
export function clearConfigCache(url?: string): void {
  if (url === undefined)
    configCache.clear()
  else
    configCache.delete(url)
}

export type { PetConfigSource }
