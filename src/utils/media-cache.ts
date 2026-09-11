/**
 * 媒体资源的取回与展示地址。
 *
 * **存储本身不在这里**：缓存值由 reause 的 `useIDBKeyval`
 * （`@reause/integrations/useIDBKeyval`）持有 —— 它负责读 IndexedDB、写回、
 * 以及跨标签页同步；`hooks/use-cached-media.ts` 负责「什么时候抓、抓到什么、
 * 怎么变成能播的地址」。
 *
 * 这里只放两件与 IndexedDB 无关的事：
 * 1. `fetchMediaBlob`：抓资源并修正 MIME；
 * 2. `createMediaObjectUrl`：blob → object URL 的按源去重（同一资源只建一次，重复渲染/多实例共用）。
 */

/** IndexedDB key 前缀（`useIDBKeyval` 的 key）。 */
export const MEDIA_CACHE_PREFIX = 'dsh-pet-component/media:'

/** 按源去重的 object URL —— 模块级，多个宠物实例 / 多次重播共用同一份。 */
const objectUrls = new Map<string, string>()

/**
 * 推断资源 MIME。
 *
 * 必须自己修：`raw.githubusercontent.com` 把 `.webm` 标成 `audio/webm`，
 * 而 `URL.createObjectURL(blob)` 造的 blob URL 会**原样带着这个类型**——部分浏览器
 * 据此拒绝在 `<video>` 里解码。按扩展名归一化后行为稳定。
 */
export function inferMediaType(source: string, headerType?: string | null): string {
  const header = headerType ?? ''
  if (header.startsWith('video/') || header.startsWith('image/'))
    return header
  const path = source.split(/[?#]/)[0]!.toLowerCase()
  if (path.endsWith('.webm'))
    return 'video/webm'
  if (path.endsWith('.mov'))
    return 'video/quicktime'
  if (path.endsWith('.mp4') || path.endsWith('.m4v'))
    return 'video/mp4'
  if (path.endsWith('.webp'))
    return 'image/webp'
  if (path.endsWith('.png'))
    return 'image/png'
  if (path.endsWith('.gif'))
    return 'image/gif'
  if (path.endsWith('.avif'))
    return 'image/avif'
  if (path.endsWith('.jpeg') || path.endsWith('.jpg'))
    return 'image/jpeg'
  return header === '' ? 'application/octet-stream' : header
}

/** 抓资源并返回带正确 MIME 的 `Blob`（喂给 `useIDBKeyval` 写回缓存）。 */
export async function fetchMediaBlob(source: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(source, { signal })
  if (!response.ok)
    throw new Error(`Failed to load pet asset ${source}: HTTP ${response.status}`)

  const type = inferMediaType(source, response.headers.get('content-type'))
  return new Blob([await response.arrayBuffer()], { type })
}

/** blob → object URL（同一 `source` 只建一次，已建过就复用，避免重复分配与中途失效）。 */
export function createMediaObjectUrl(source: string, blob: Blob): string {
  const existing = objectUrls.get(source)
  if (existing !== undefined)
    return existing
  const url = URL.createObjectURL(blob)
  objectUrls.set(source, url)
  return url
}
