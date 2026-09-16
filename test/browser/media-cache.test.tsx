import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMediaObjectUrl, fetchMediaBlob, inferMediaType } from '../../src/utils/media-cache'

/**
 * 媒体取回与展示地址（`src/utils/media-cache.ts`）。
 *
 * 这里的分支都是「线上真踩过的」：`raw.githubusercontent.com` 把 `.webm` 标成 `audio/webm`、
 * 代理抖动导致一次抓取失败、切动画/卸载要中止在途请求、同一资源在多实例间复用 object URL。
 */

/** 造一个带状态码与 Content-Type 的响应。 */
function makeResponse(body: BodyInit | null, status: number, contentType?: string): Response {
  return new Response(body, {
    status,
    headers: contentType === undefined ? undefined : { 'content-type': contentType },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('inferMediaType', () => {
  it('响应头已经是 video/ 或 image/ 时原样采用', () => {
    expect(inferMediaType('/a.bin', 'video/mp4')).toBe('video/mp4')
    expect(inferMediaType('/a.bin', 'image/webp')).toBe('image/webp')
  })

  it('按扩展名归一化（raw.githubusercontent 会把 .webm 标成 audio/webm）', () => {
    expect(inferMediaType('https://example.com/a.webm', 'audio/webm')).toBe('video/webm')
    expect(inferMediaType('/a.webm')).toBe('video/webm')
    expect(inferMediaType('/a.mov')).toBe('video/quicktime')
    expect(inferMediaType('/a.mp4')).toBe('video/mp4')
    expect(inferMediaType('/a.m4v')).toBe('video/mp4')
    expect(inferMediaType('/a.webp')).toBe('image/webp')
    expect(inferMediaType('/a.png')).toBe('image/png')
    expect(inferMediaType('/a.gif')).toBe('image/gif')
    expect(inferMediaType('/a.avif')).toBe('image/avif')
    expect(inferMediaType('/a.jpeg')).toBe('image/jpeg')
    expect(inferMediaType('/a.jpg')).toBe('image/jpeg')
  })

  it('查询串与锚点不参与扩展名判定，大小写不敏感', () => {
    expect(inferMediaType('/a.WEBM?token=1#frag')).toBe('video/webm')
    expect(inferMediaType('https://example.com/x/a.PNG?v=2')).toBe('image/png')
  })

  it('无法识别的扩展名回落响应头；没有响应头则回落 octet-stream', () => {
    expect(inferMediaType('/a.bin', 'text/plain')).toBe('text/plain')
    expect(inferMediaType('/a.bin')).toBe('application/octet-stream')
    expect(inferMediaType('/a.bin', '')).toBe('application/octet-stream')
    expect(inferMediaType('', null)).toBe('application/octet-stream')
  })
})

describe('fetchMediaBlob', () => {
  it('成功时按扩展名修正 MIME 并返回 blob', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeResponse(new Uint8Array([1, 2, 3]), 200, 'audio/webm'))

    const blob = await fetchMediaBlob('/pets/a.webm')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(blob.type).toBe('video/webm')
    expect(blob.size).toBe(3)
    // 「地址即内容键」的约定：同一个地址第二次起尽量走 HTTP 缓存
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ cache: 'force-cache' })
  })

  it('4xx 是对方明确拒绝，不重试', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse('', 404))

    await expect(fetchMediaBlob('/pets/missing.webm')).rejects.toThrow(/HTTP 404/)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('5xx 是抖动，短延迟后重试一次并成功', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse('', 503))
      .mockResolvedValueOnce(makeResponse(new Uint8Array([9]), 200, 'image/png'))

    const blob = await fetchMediaBlob('/pets/a.png')

    expect(spy).toHaveBeenCalledTimes(2)
    expect(blob.size).toBe(1)
    expect(blob.type).toBe('image/png')
  })

  it('已经中止的 signal 不再重试（切动画 / 卸载）', async () => {
    const controller = new AbortController()
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse('', 503))
    controller.abort()

    await expect(fetchMediaBlob('/pets/a.webm', controller.signal)).rejects.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('createMediaObjectUrl', () => {
  it('同一 source 只分配一次，多实例 / 重播共用', () => {
    const first = createMediaObjectUrl('shared-a.webm', new Blob(['a'], { type: 'video/webm' }))
    const second = createMediaObjectUrl('shared-a.webm', new Blob(['b'], { type: 'video/webm' }))

    expect(first).not.toBe('')
    expect(second).toBe(first)
  })

  it('不同 source 各自分配', () => {
    const blob = new Blob(['c'], { type: 'video/webm' })
    expect(createMediaObjectUrl('shared-b.webm', blob)).not.toBe(createMediaObjectUrl('shared-c.webm', blob))
  })
})
