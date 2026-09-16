import { describe, expect, it } from 'vitest'

/**
 * 测试素材守卫。
 *
 * 仓库里本来没有任何媒体文件，演练场用的是远程 URL（测试不能联网）。这份 webm 是用
 * `node_modules/.cache/make-fixture.mjs` 现场造的：Chrome canvas 出 JPEG 帧 →
 * Playwright 自带 ffmpeg（`mjpeg` + `image2pipe` + `libvpx` + `webm`）编码成 VP8 webm，
 * 同一个字节复制成 9 个动作名（默认扩展名 `webm`，见 `PET_DEFAULT_EXT`）。
 *
 * 这条用例同时锁两件事：素材确实能被浏览器取到并解码（`fetch` 走的是 Vite 的静态服务）、
 * 以及它**会播完**（`ended`）—— 那是 dsh 渲染器「一次性动作播完 → `finish()`」的前提。
 */
describe('测试素材', () => {
  it('webm 能取到、能解码、能播完', async () => {
    const response = await fetch('/test/fixtures/pets/idle.webm')
    expect(response.ok).toBe(true)

    const url = URL.createObjectURL(await response.blob())
    const video = document.createElement('video')
    video.muted = true
    video.src = url
    document.body.append(video)

    try {
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadeddata', () => resolve(), { once: true })
        video.addEventListener('error', () => reject(new Error(`视频无法解码：${video.error?.message ?? '未知错误'}`)), { once: true })
      })
      expect(video.videoWidth).toBe(160)
      expect(video.duration).toBeGreaterThan(0)

      await new Promise<void>((resolve, reject) => {
        video.addEventListener('ended', () => resolve(), { once: true })
        video.play().catch(error => reject(error))
      })
      expect(video.ended).toBe(true)
    }
    finally {
      video.remove()
      URL.revokeObjectURL(url)
    }
  })
})
