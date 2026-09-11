/**
 * 平台判定与「按平台取默认值」的小工具。
 *
 * dsh-pet 的资源在 macOS 上是另一套（WKWebView/Safari 不认 VP9-alpha webm，
 * 需要 HEVC-with-Alpha 的 `.mov`），所以 `ext` / `uri` 都是
 * `{ default, mac? }` 形状。
 */

/** 当前是否 Apple 平台（macOS / iOS / iPadOS）。SSR 下返回 `false`。 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined')
    return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/**
 * 按平台取 `{ default, mac }` 里的值。
 *
 * `value` 是 `{ default, mac? }` 形状的平台表；第二个参数显式指定是否 Apple 平台，
 * 缺省走 `isMacPlatform()`。Apple 平台没给 `mac` 值时回落 `value.default`。
 */
export function resolvePlatformValue<T>(value: { default: T, mac?: T }, mac?: boolean): T {
  if ((mac ?? isMacPlatform()) && value.mac !== undefined)
    return value.mac
  return value.default
}

/** 归一化扩展名：去掉前导点，空值回落到 `fallback`。 */
export function normalizeExtension(ext: string | undefined, fallback: string): string {
  const trimmed = (ext ?? '').trim().replace(/^\.+/, '')
  return trimmed === '' ? fallback : trimmed
}

/**
 * 拼接资源地址。
 *
 * 三种 `base` 形态都支持：
 * 1. **目录**：`https://cdn/webm` → `https://cdn/webm/<动画名>.webm`
 * 2. **模板**：`https://cdn/{name}.{ext}` → `https://cdn/待机呼吸.webm`
 * 3. **完整文件地址**（路径末段带扩展名）：`https://cdn/idle.webm` → 原样返回
 *    （单文件场景，此时忽略动画名）
 *
 * 动画名一律 `encodeURIComponent`（dsh-pet 的动画名是中文，必须编码）。
 */
export function resolveAssetUrl(base: string, name: string, ext: string): string {
  const normalizedExt = normalizeExtension(ext, 'webm')
  const raw = (base ?? '').trim()

  if (raw === '')
    return `${encodeURIComponent(name)}.${normalizedExt}`

  if (raw.includes('{name}') || raw.includes('{ext}')) {
    return raw
      .replace(/\{name\}/g, encodeURIComponent(name))
      .replace(/\{ext\}/g, normalizedExt)
  }

  const withoutTrailingSlash = raw.replace(/[\\/]+$/, '')
  // 末段带扩展名（且不是 "." / ".."）视为完整文件地址；查询串/锚点不参与扩展名判定
  const lastSegment = withoutTrailingSlash.replace(/[?#].*$/, '').split(/[\\/]/).pop() ?? ''
  if (/\.[a-z0-9]{1,8}$/i.test(lastSegment) && lastSegment !== '.' && lastSegment !== '..')
    return withoutTrailingSlash

  return `${withoutTrailingSlash}/${encodeURIComponent(name)}.${normalizedExt}`
}
