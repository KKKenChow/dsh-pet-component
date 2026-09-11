import { CssRender } from 'css-render'
import { isBrowser } from './utils/env'

/**
 * 组件样式（`css-render`）。
 *
 * 只做「组件跑起来必需的布局」：根盒子、媒体层、命中箱、镜像。**所有观感类的样式
 * （边框/阴影/背景/动画时长）都留给使用方**，通过 `className` / `style` 覆盖——
 * 桌宠应该无缝长在宿主页面里，而不是自带一套主题。
 *
 * 为什么用 css-render 而不是内联样式：命中箱的 `:active` 光标、`:focus-visible` 等
 * 伪类无法内联；同时 css-render 的 `mount({ id })` 天然幂等，多实例只注入一个
 * `<style>`。
 */
export const PET_STYLE_ID = 'dsh-pet-component/styles'

const { c } = CssRender()

const style = c([
  c('.dsh-pet', {
    position: 'relative',
    display: 'inline-block',
    lineHeight: '0',
    pointerEvents: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    // 命中箱用 pointer 事件定位，触摸端不做浏览器手势接管（拖拽由调用方实现）
    touchAction: 'none',
  }),
  c('.dsh-pet--hidden', {
    visibility: 'hidden',
  }),
  c('.dsh-pet__media', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    transformOrigin: 'center',
  }),
  c('.dsh-pet__media--mirrored', {
    transform: 'scaleX(-1)',
  }),
  c('.dsh-pet__video', {
    objectFit: 'contain',
    // 透明视频的底层必须是真透明（Safari/旧 WebKit 会画黑底）
    background: 'transparent',
    // 双缓冲淡入淡出：前台 1、后台 0（与 dsh-pet .dsh-pet-video / .is-front 同语义）
    opacity: '0',
    transition: 'opacity 180ms ease',
  }),
  c('.dsh-pet__video.is-front', {
    opacity: '1',
  }),
  // 减少动效：交叉淡入本身就是动效
  c('@media (prefers-reduced-motion: reduce)', [
    c('.dsh-pet__video', { transition: 'none' }),
  ]),
  c('.dsh-pet__sprite', {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    backgroundRepeat: 'no-repeat',
    transformOrigin: 'center',
  }),
  c('.dsh-pet__hitbox', {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'grab',
    touchAction: 'none',
    // 命中箱在媒体层之上
    zIndex: '1',
  }),
  c('.dsh-pet__hitbox:active', {
    cursor: 'grabbing',
  }),
])

let mounted = false

/**
 * 注入组件样式（幂等；模块级标记 + css-render 的 id 双重去重）。
 * SSR 下是 no-op —— 样式在客户端挂载时注入。
 */
export function mountPetStyles(): void {
  if (mounted || !isBrowser || !document.head)
    return
  mounted = true
  try {
    style.mount({ id: PET_STYLE_ID, head: true })
  }
  catch {
    // 注入失败（极端 CSP 场景）不应该让组件挂掉：布局退化为无样式但结构正确
    mounted = false
  }
}

/** 卸载组件样式（测试/微前端场景用；正常使用不需要调用）。 */
export function unmountPetStyles(): void {
  if (!isBrowser)
    return
  mounted = false
  style.unmount({ id: PET_STYLE_ID })
}
