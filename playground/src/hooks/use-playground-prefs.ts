import type { Motion } from 'dsh-pet-component'
import { useLocalStorage } from '@reaxuse/core'

/** 演示面板上的可调项。 */
export interface PlaygroundPrefs {
  /** 当前素材：dsh-pet 的 config.jsonc + webm，或 Codex 的 pet.json + 雪碧图 */
  asset: 'dsh' | 'codex'
  /** 声明层动作（`motion` prop） */
  motion: Motion
  /** 声明层循环开关 */
  loop: boolean
  /**
   * 每个素材各自的尺寸（px）。两套协议的「同宽度」不是同一个视觉大小 ——
   * Codex 格子里人物基本铺满，dsh-pet 的 16:9 画布里人物只占中间一块，
   * 所以 Codex 的默认按一半取（与组件的默认基准 `CODEX_DEFAULT_SIZE` 一致）。
   */
  sizes: Record<'dsh' | 'codex', number>
  cache: boolean
  mirrored: boolean
  /** Codex v2 的鼠标追踪 look 格 */
  lookAtPointer: boolean
  /** 把 `dsh-pet__hitbox` 描出来（看清拖动区到底在哪） */
  showHitbox: boolean
}

export const PLAYGROUND_PREFS_KEY = 'dsh-pet-component/playground:prefs'

const DEFAULTS: PlaygroundPrefs = {
  asset: 'dsh',
  motion: 'idle',
  loop: true,
  sizes: { dsh: 300, codex: 150 },
  cache: true,
  mirrored: false,
  lookAtPointer: true,
  showHitbox: false,
}

export interface UsePlaygroundPrefsResult {
  prefs: PlaygroundPrefs
  update: <K extends keyof PlaygroundPrefs>(key: K, value: PlaygroundPrefs[K]) => void
  /** 清掉存储条目，回落到默认值（`useLocalStorage` 的 `setValue(null)`） */
  reset: () => void
}

/**
 * Playground 的偏好持久化 —— 直接交给 reaxuse 的 `useLocalStorage`
 * （VueUse `useLocalStorage` 的 React 移植）存到 `window.localStorage`：
 * 跨刷新保留、跨标签页同步、类型猜测序列化、`mergeDefaults` 浅合并都在它里面，
 * 这里不再自带一份 storage 实现。写的是整个对象
 * （React 没有深层侦听，改一个字段就写一份新的）。
 *
 * 读的时候再和默认值合并一次：`mergeDefaults` 已经在存储层做了浅合并，
 * 这里同时兜住「条目被删掉（值是 `null`）」与将来新增字段两种情况。
 */
export function usePlaygroundPrefs(): UsePlaygroundPrefsResult {
  const [stored, setStored] = useLocalStorage<PlaygroundPrefs>(
    PLAYGROUND_PREFS_KEY,
    DEFAULTS,
    { mergeDefaults: true, writeDefaults: true, listenToStorageChanges: true },
  )

  const prefs: PlaygroundPrefs = { ...DEFAULTS, ...(stored ?? {}) }

  return {
    prefs,
    update(key, value) {
      setStored({ ...prefs, [key]: value })
    },
    reset() {
      setStored(null)
    },
  }
}
