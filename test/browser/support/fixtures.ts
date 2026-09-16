import type { CodexPetConfig, DshPetConfig } from '../../../src/types'

/**
 * 浏览器测试的素材与配置工厂。
 *
 * **素材**：仓库里没有任何媒体文件，演练场用的是远程 URL（测试不能联网），
 * 所以 `test/fixtures/pets/*.webm` 是现场造的（生成方式见 `test/fixtures/README.md`）：
 * 9 个动作名，同一份 160×90 / 1s 的 VP8 webm（5.4KB）。默认扩展名是 `webm`
 * （`PET_DEFAULT_EXT`），所以目录形态的 `uri` 正好能拼出这些文件名。
 *
 * **配置**：`config` 既可以直接给对象，也可以给地址（组件 `fetch` 后剥注释再解析）。
 * 地址形态用 `data:` URL —— `fetch` 支持它，且完全不联网。
 */

/** 9 个动作名的 webm 所在目录。 */
export const PET_MEDIA_DIR = '/test/fixtures/pets'
/** 单文件形态：末段带扩展名 → `resolveAssetUrl` 原样返回（忽略动画名）。 */
export const PET_MEDIA_FILE = `${PET_MEDIA_DIR}/idle.webm`
/** 模板形态：测 `{name}` / `{ext}` 占位符分支。 */
export const PET_MEDIA_TEMPLATE = `${PET_MEDIA_DIR}/{name}.{ext}`

/** dsh 的 `uri` / `ext` prop 都是 `{ default, mac? }` 形状。 */
export const dshUri = { default: PET_MEDIA_DIR }
export const dshExt = { default: 'webm' }

/** 画一张 `columns` 列 × `rows` 行的雪碧图，返回 data URL（`<img>` 与 `new Image()` 都能加载）。 */
export function makeSpritesheetDataUrl(options: { columns?: number, rows?: number, cell?: number } = {}): string {
  const columns = options.columns ?? 8
  const rows = options.rows ?? 11
  const cell = options.cell ?? 16
  const canvas = document.createElement('canvas')
  canvas.width = columns * cell
  canvas.height = rows * cell
  const context = canvas.getContext('2d')
  if (context === null)
    throw new Error('拿不到 2d context')
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      context.fillStyle = `hsl(${(row * 41 + column * 13) % 360} 75% 45%)`
      context.fillRect(column * cell, row * cell, cell, cell)
    }
  }
  return canvas.toDataURL('image/png')
}

/** 最小可用 dsh 配置：动作 → 动画名（= 素材文件名主名），并打开碎碎念。 */
export function makeDshConfig(overrides: Partial<DshPetConfig> = {}): DshPetConfig {
  return {
    size: 160,
    whisperPrompt: '说一句碎碎念',
    pets: [{ id: 'p1', whisperEnabled: true }],
    motions: {
      'idle': 'idle',
      'thinking': 'thinking',
      'working': 'working',
      'result': 'result',
      'success': 'success',
      'failed': 'failed',
      'error': 'error',
      'waiting': 'waiting',
      'dragging': 'dragging',
      'moving-left': 'idle',
      'moving-right': 'idle',
    },
    ...overrides,
  }
}

/** 最小可用 Codex 配置：v2 图集（11 行，行 9-10 是 16 个 look 格）。 */
export function makeCodexConfig(overrides: Partial<CodexPetConfig> = {}): CodexPetConfig {
  return {
    spriteVersionNumber: 2,
    columns: 8,
    frameWidth: 192,
    frameHeight: 208,
    ...overrides,
  }
}

/** 任意 JSON 文本 → `data:` URL（用于测「`config` 给地址」的拉取路径，不联网）。 */
export function textDataUrl(text: string, mime = 'application/json'): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`
}

/** 配置对象 → `data:` URL。 */
export function configDataUrl(config: unknown, mime = 'application/json'): string {
  return textDataUrl(JSON.stringify(config), mime)
}

/** 取一个必然存在的元素：测试里缺元素应当抛错，而不是静默拿到 `undefined`。 */
export function query(container: HTMLElement | Document, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector)
  if (element === null)
    throw new Error(`找不到元素：${selector}`)
  return element
}

/** 等到下一帧（浏览器完成一次样式重算 / 播放推进）。 */
export function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

/** 推进若干帧。 */
export async function nextFrames(count = 2): Promise<void> {
  for (let index = 0; index < count; index++)
    await nextFrame()
}
