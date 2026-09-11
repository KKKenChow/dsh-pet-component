import { useIDBKeyval } from '@reaxuse/integrations/useIDBKeyval'
import { useEffect, useRef, useState } from 'react'
import { createMediaObjectUrl, fetchMediaBlob, MEDIA_CACHE_PREFIX } from '../utils/media-cache'

/** 缓存条目：自带 `source` 标记，理由见下方。 */
interface MediaCacheEntry {
  source: string
  blob: Blob
}

/** 关缓存 / 空转时用的占位 key：让 `useIDBKeyval` 不碰真实条目。 */
const IDLE_KEY = `${MEDIA_CACHE_PREFIX}@none`

/**
 * `cache` prop 的实现 —— **存储交给 `useIDBKeyval`**：读 IndexedDB、写回、
 * 跨标签页同步都由它负责，这里只管「用哪个地址」和「未命中时把资源抓回来写进去」。
 *
 * 取值规则：
 * 1. **命中**（store 里那条记录的 `source` 正是当前资源）→ blob 的 object URL；
 * 2. **未命中** → 原始地址立即起播，同时后台抓一次 `setStored(entry)` 写回，
 *    第二次（重播 / 重新挂载 / 断网）就走本地；
 * 3. **关缓存** → 直接用原始地址，不读不写。
 *
 * 两个刻意的细节：
 *
 * - **一个 source 只解析一次地址**（`resolved` 记着已解析的 source）：后台写回成功、
 *   或迟到的读命中都会让「当前资源有缓存了」，但那时动画已经在播 —— 中途换地址会让
 *   `<video>` 从头重播（对一次性动作是致命的）。后到的缓存留给**下一次**播放。
 * - **开缓存时先等首次读取落地再定地址**：`useIDBKeyval` 的读是异步的，不等它就会先按
 *   远端地址起播、读完发现命中再换 blob，白白多加载一次（断网时还直接失败）。
 *
 * 条目为什么要带 `source` 标记：`useIDBKeyval` 在 key 变化时只重读、**不复位 state**
 * （读到缺失的 key 更会一直留着上一个 key 的值），标记对不上就不算命中，避免张冠李戴。
 *
 * @param source 资源原始地址（`null` 表示还没有可播资源）
 * @param cache 是否启用 IndexedDB 缓存
 * @param onError 读取 / 抓取失败回调（不阻断播放）
 * @returns 喂给 `<video>` / 背景图的地址
 */
export function useCachedMediaUrl(
  source: string | null,
  cache: boolean,
  onError?: (error: unknown) => void,
): string | null {
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  const [stored, setStored, { isFinished }] = useIDBKeyval<MediaCacheEntry | null>(
    source === null || !cache ? IDLE_KEY : MEDIA_CACHE_PREFIX + source,
    null,
    { writeDefaults: false, onError: error => onErrorRef.current?.(error) },
  )

  const hit = source !== null && stored !== null && stored.source === source ? stored.blob : null
  // 开缓存、首次读取还没落地：先不定地址（否则会先按远端地址白加载一次）
  const settling = cache && source !== null && !isFinished && stored === null

  // 每个 source 只解析一次地址（渲染期派生 state）
  const [resolved, setResolved] = useState<{ source: string, src: string } | null>(null)
  if (source !== null && !settling && resolved?.source !== source)
    setResolved({ source, src: hit !== null ? createMediaObjectUrl(source, hit) : source })

  // 未命中：抓一次交给 useIDBKeyval 写回；命中一旦落地就中止这次抓取
  useEffect(() => {
    if (source === null || !cache || !isFinished || hit !== null)
      return undefined
    const controller = new AbortController()
    void fetchMediaBlob(source, controller.signal)
      .then(blob => setStored({ source, blob }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          onErrorRef.current?.(error)
      })
    return () => controller.abort()
  }, [cache, hit, isFinished, setStored, source])

  return source !== null && resolved?.source === source ? resolved.src : null
}
