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
  // 气泡外壳（只有 `Pet` 会渲染它）：给「渲染器 + 气泡层」一个共同的定位上下文。
  // 与 `.dsh-pet` 同为 inline-block，不改变宿主既有布局；它同时是 `--dsh-pet-size`
  // （气泡全部尺寸的等比基准）的落点 —— 基准值由 `Pet` 实测宠物宽度后写入。
  c('.dsh-pet-shell', {
    position: 'relative',
    display: 'inline-block',
    lineHeight: '0',
  }),
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

  /* --------------------------------- 气泡层 -------------------------------- */
  // 叠加在宠物上方（绝对定位，不参与宿主布局）。所有尺寸基于 `--dsh-pet-size`
  // （渲染器写入的实际宠物宽度）等比缩放 —— 系数逐值对齐 dsh-pet 的
  // `.dsh-pet-bubble`（`source/dsh-pet/dsh-pet/src/client/bubble.ts`，按默认 462px 设计）。
  c('.dsh-pet__bubbles', {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'calc(var(--dsh-pet-size, 462px) * 0.013)',
    zIndex: '3',
    pointerEvents: 'none',
  }),
  c('.dsh-pet__bubbles--top', {
    bottom: 'calc(100% - var(--dsh-pet-size, 462px) * 0.108)',
  }),
  c('.dsh-pet__bubbles--bottom', {
    top: 'calc(100% - var(--dsh-pet-size, 462px) * 0.108)',
  }),
  c('.dsh-pet__bubble', {
    position: 'relative',
    boxSizing: 'border-box',
    minWidth: 'calc(var(--dsh-pet-size, 462px) * 0.26)',
    maxWidth: 'calc(var(--dsh-pet-size, 462px) * 0.5)',
    padding: 'calc(var(--dsh-pet-size, 462px) * 0.022) calc(var(--dsh-pet-size, 462px) * 0.030)',
    borderRadius: 'calc(var(--dsh-pet-size, 462px) * 0.035)',
    background: 'rgba(255, 255, 255, 0.92)',
    color: '#2b2b2b',
    fontFamily: '"ShangshouSoftCandy", "Yuanti SC", "YouYuan", "幼圆", "Comic Sans MS", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: 'calc(var(--dsh-pet-size, 462px) * 0.0455)',
    lineHeight: '1.6',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    boxShadow: '0 calc(var(--dsh-pet-size, 462px) * 0.009) calc(var(--dsh-pet-size, 462px) * 0.035) rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.08)',
    backdropFilter: 'blur(6px)',
    // 气泡按需挂载/卸载（没有常驻节点可以切 `.is-on`），所以淡入用一次性 keyframes：
    // 时长与 dsh-pet 的 `transition: opacity .25s ease` 一致
    animation: 'dsh-pet-bubble-in 250ms ease both',
  }),
  c('@keyframes dsh-pet-bubble-in', {
    from: {
      opacity: '0',
      transform: 'translateY(calc(var(--dsh-pet-size, 462px) * 0.011))',
    },
    to: {
      opacity: '1',
      transform: 'translateY(0)',
    },
  }),
  // 底部小尾巴：指向下方宠物（只在最靠近宠物的那一条上画）
  c('.dsh-pet__bubbles--top .dsh-pet__bubble:last-child::after', {
    content: '""',
    position: 'absolute',
    left: '50%',
    bottom: 'calc(var(--dsh-pet-size, 462px) * -0.017)',
    transform: 'translateX(-50%)',
    border: 'calc(var(--dsh-pet-size, 462px) * 0.017) solid transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.92)',
    borderBottom: 'none',
  }),
  // 反向摆放时尾巴朝上（同一个系数，方向镜像）
  c('.dsh-pet__bubbles--bottom .dsh-pet__bubble:first-child::after', {
    content: '""',
    position: 'absolute',
    left: '50%',
    top: 'calc(var(--dsh-pet-size, 462px) * -0.017)',
    transform: 'translateX(-50%)',
    border: 'calc(var(--dsh-pet-size, 462px) * 0.017) solid transparent',
    borderBottomColor: 'rgba(255, 255, 255, 0.92)',
    borderTop: 'none',
  }),
  // 碎碎念文本气泡：字号缩到常规气泡的 0.75（0.0455 → 0.034）、允许换行、
  // 宽度随文字自适应（短句窄框、长句封顶绕行）—— 与 dsh-pet 的 `.dsh-pet-whisper` 同系数
  c('.dsh-pet__bubble--muttering', {
    fontSize: 'calc(var(--dsh-pet-size, 462px) * 0.034)',
    minWidth: 'calc(var(--dsh-pet-size, 462px) * 0.10)',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
  }),
  // 带图气泡：取消 min-width，让气泡贴合图片宽度（否则图旁留大片空白）
  c('.dsh-pet__bubble--has-image', {
    minWidth: '0',
  }),
  c('.dsh-pet__bubble-image', {
    display: 'block',
    width: 'calc(var(--dsh-pet-size, 462px) * 0.34)',
    height: 'auto',
    margin: '0 auto calc(var(--dsh-pet-size, 462px) * 0.017)',
    borderRadius: 'calc(var(--dsh-pet-size, 462px) * 0.026)',
    objectFit: 'cover',
    pointerEvents: 'none',
    userSelect: 'none',
  }),
  c('.dsh-pet__bubble-head', {
    display: 'flex',
    alignItems: 'center',
    gap: 'calc(var(--dsh-pet-size, 462px) * 0.013)',
  }),
  c('.dsh-pet__bubble-icon', {
    display: 'inline-flex',
    flexShrink: '0',
  }),
  c('.dsh-pet__bubble-glyph', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
    width: 'calc(var(--dsh-pet-size, 462px) * 0.045)',
    height: 'calc(var(--dsh-pet-size, 462px) * 0.045)',
    borderRadius: '50%',
    background: 'rgba(43, 43, 43, 0.08)',
    fontSize: 'calc(var(--dsh-pet-size, 462px) * 0.030)',
    lineHeight: '1',
  }),
  // 加载态：纯 CSS 圆环（不引依赖），旋转在减少动效下停用
  c('.dsh-pet__bubble-spinner', {
    display: 'inline-block',
    flexShrink: '0',
    width: 'calc(var(--dsh-pet-size, 462px) * 0.041)',
    height: 'calc(var(--dsh-pet-size, 462px) * 0.041)',
    border: 'calc(var(--dsh-pet-size, 462px) * 0.005) solid rgba(43, 43, 43, 0.18)',
    borderTopColor: 'rgba(43, 43, 43, 0.62)',
    borderRadius: '50%',
    animation: 'dsh-pet-bubble-spin 700ms linear infinite',
  }),
  c('@keyframes dsh-pet-bubble-spin', {
    to: { transform: 'rotate(360deg)' },
  }),
  c('.dsh-pet__bubble-title', {
    fontSize: 'calc(var(--dsh-pet-size, 462px) * 0.035)',
    color: 'rgba(43, 43, 43, 0.6)',
  }),
  c('.dsh-pet__bubble-text', {
    marginTop: 'calc(var(--dsh-pet-size, 462px) * 0.009)',
  }),
  // 语义色只染色图标（气泡底色保持白色，与 dsh-pet 的白气泡观感一致）
  c('.dsh-pet__bubble--success .dsh-pet__bubble-glyph', {
    background: 'rgba(46, 158, 79, 0.16)',
    color: '#2e9e4f',
  }),
  c('.dsh-pet__bubble--warning .dsh-pet__bubble-glyph', {
    background: 'rgba(214, 158, 46, 0.18)',
    color: '#a8730f',
  }),
  c('.dsh-pet__bubble--danger .dsh-pet__bubble-glyph', {
    background: 'rgba(217, 79, 61, 0.16)',
    color: '#d94f3d',
  }),
  c('@media (prefers-reduced-motion: reduce)', [
    c('.dsh-pet__bubble', { animation: 'none' }),
    c('.dsh-pet__bubble-spinner', { animation: 'none' }),
  ]),
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
