import { useId } from 'react'

/**
 * 加载态图标 —— 与 desktop 一致用 **HeroUI `Spinner`**（`@heroui/react` 的
 * `components/spinner/spinner.js` → `SpinnerPrimitive`）：两段圆弧，各自带一个
 * linearGradient 做「实 → 淡」过渡；desktop 在 `isLoading` 时就是
 * `<Toast.Indicator><Spinner color="current" size="sm" /></Toast.Indicator>`，
 * 而 toast 的样式把 spinner 定成 `size-4`（16px）。
 *
 * 这里逐值复制它的 `viewBox` / 路径 / 渐变坐标 / `transform`，只把 gradient id 换成
 * `useId` 派生的唯一值（同一页多个实例不会互相串用渐变）。尺寸与旋转在 `src/styles.ts`。
 */
export function BubbleSpinner() {
  const gradientId = useId().replace(/[^a-z0-9]/gi, '')
  const solidId = `dsh-pet-spinner-solid-${gradientId}`
  const fadeId = `dsh-pet-spinner-fade-${gradientId}`

  return (
    <svg
      aria-hidden="true"
      className="dsh-pet__bubble-spinner"
      fill="none"
      role="presentation"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={solidId} x1="50%" x2="50%" y1="5.271%" y2="91.793%">
          <stop offset="0%" stopColor="currentColor" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={fadeId} x1="50%" x2="50%" y1="15.24%" y2="87.15%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <g fill="none">
        <path
          d="M8.749.021a1.5 1.5 0 0 1 .497 2.958A7.5 7.5 0 0 0 3 10.375a7.5 7.5 0 0 0 7.5 7.5v3c-5.799 0-10.5-4.7-10.5-10.5C0 5.23 3.726.865 8.749.021"
          fill={`url(#${solidId})`}
          transform="translate(1.5 1.625)"
        />
        <path
          d="M15.392 2.673a1.5 1.5 0 0 1 2.119-.115A10.48 10.48 0 0 1 21 10.375c0 5.8-4.701 10.5-10.5 10.5v-3a7.5 7.5 0 0 0 5.007-13.084a1.5 1.5 0 0 1-.115-2.118"
          fill={`url(#${fadeId})`}
          transform="translate(1.5 1.625)"
        />
      </g>
    </svg>
  )
}
