import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

const POLL_MS = 150

/**
 * 读回子组件写在 DOM 上的属性（组件会把 `data-motion` / `data-animation` / `data-look`
 * 挂在根节点上）。演示面板用轮询而不是 MutationObserver：对「每帧都可能变」的
 * look 格更直观，代码也短。
 */
export function useDomAttribute(
  containerRef: RefObject<HTMLElement | null>,
  selector: string,
  attribute: string,
): string | undefined {
  const [value, setValue] = useState<string | undefined>(undefined)

  useEffect(() => {
    const read = () => {
      const next = containerRef.current?.querySelector(selector)?.getAttribute(attribute) ?? undefined
      setValue(previous => (previous === next ? previous : next))
    }
    // 首帧读一次不放在 effect 同步阶段（避免额外的同步重渲染），随后按轮询跟进
    const initial = window.setTimeout(read, 0)
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [attribute, containerRef, selector])

  return value
}
