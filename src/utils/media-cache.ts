/**
 * 媒体资源的取回与展示地址。
 *
 * **存储本身不在这里**：缓存值由 reause 的 `useIDBKeyval`
 * （`@reause/integrations/useIDBKeyval`）持有 —— 它负责读 IndexedDB、写回、
 * 以及跨标签页同步；`hooks/use-cached-media.ts` 负责「什么时候抓、抓到什么、
 * 怎么变成能播的地址」。
 *
 * 这里只放两件与 IndexedDB 无关的事：
 * 1. `fetchMediaBlob`：抓资源、修正 MIME，并做「force-cache + 失败重试一次」；
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

/** 抓取失败后的短重试延迟（ms）：网络 / 代理抖动不值得直接判定成「不可缓存」。 */
const MEDIA_FETCH_RETRY_DELAY = 400

/** 带状态码的抓取错误：用来区分「服务器明确拒绝」（4xx，重试无意义）与其余失败。 */
class MediaFetchError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MediaFetchError'
    this.status = status
  }
}

/** 单次抓取：发请求、校验状态码、按扩展名修正 MIME。 */
async function requestMediaBlob(source: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(source, { cache: 'force-cache', signal })
  if (!response.ok)
    throw new MediaFetchError(`Failed to load pet asset ${source}: HTTP ${response.status}`, response.status)

  const type = inferMediaType(source, response.headers.get('content-type'))
  return new Blob([await response.arrayBuffer()], { type })
}

/**
 * 重试前的短等待。
 *
 * 刻意不接 `signal`：只有 400ms，且调用方在等待结束后会复查 `signal.aborted`
 * （中止的调用方本来就不再关心这次抓取的结果，链路里的 `.catch` 也会直接忽略）。
 */
function sleepBeforeRetry(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 抓资源并返回带正确 MIME 的 `Blob`（喂给 `useIDBKeyval` 写回缓存）。
 *
 * 两个刻意的选择：
 *
 * - **`cache: 'force-cache'`**：同一个地址第二次起（重播 / 多实例 / 刷新）尽量走
 *   HTTP 缓存，不再产生第二次网络传输。缓存键就是地址本身，与 IndexedDB 那边
 *   同一套「地址即内容键」的约定一致。
 * - **失败短延迟重试一次**：代理、DNS、连接复用的抖动很常见，一次失败不足以把某个
 *   资源判定成「抓不下来」。**中止**（切动画 / 卸载）与 **4xx**（对方明确拒绝，
 *   例如 CORS 被拦、404）不重试 —— 前者已经没人要结果，后者重试也是同样结果。
 */
export async function fetchMediaBlob(source: string, signal?: AbortSignal): Promise<Blob> {
  try {
    return await requestMediaBlob(source, signal)
  }
  catch (error) {
    const status = error instanceof MediaFetchError ? error.status : undefined
    if (signal?.aborted || (status !== undefined && status < 500))
      throw error
    await sleepBeforeRetry(MEDIA_FETCH_RETRY_DELAY)
    if (signal?.aborted)
      throw error
    return await requestMediaBlob(source, signal)
  }
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
