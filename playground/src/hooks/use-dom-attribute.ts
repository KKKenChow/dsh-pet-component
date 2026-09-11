import type { RefObject } from 'react'
import { useMutationObserver } from '@reause/core'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 读回子组件写在 DOM 上的属性（组件会把 `data-motion` / `data-animation` / `data-look`
 * 挂在根节点上）。
 *
 * 用 reause 的 `useMutationObserver` 盯属性变化，而不是自己起 `setInterval` 轮询：
 * look 格只在指针真的移动时才变，事件驱动既没有 150ms 的显示延迟，也没有一直空转的
 * 定时器。观察范围是整个容器（`subtree` + `childList`），这样宠物根节点被换掉、
 * 或属性被摘掉时都能重新读到值。
 */
export function useDomAttribute(
  containerRef: RefObject<HTMLElement | null>,
  selector: string,
  attribute: string,
): string | undefined {
  const [value, setValue] = useState<string | undefined>(undefined)

  // 参数只在调用方写成字面量时稳定；用 ref 兜住，读值回调永远拿到最新的一对
  const queryRef = useRef({ selector, attribute })
  queryRef.current = { selector, attribute }

  const read = useCallback(() => {
    const query = queryRef.current
    const next = containerRef.current?.querySelector(query.selector)?.getAttribute(query.attribute) ?? undefined
    // eslint-disable-next-line react/set-state-in-effect -- 两处调用都是刻意同步的：MutationObserver 回调本来就是事件回调，而挂载补读是为了和「容器里已经带着属性」的 DOM 对齐；值没变时 React 会丢弃这次 setState
    setValue(previous => (previous === next ? previous : next))
  }, [containerRef])

  useMutationObserver(containerRef, read, {
    attributes: true,
    attributeFilter: [attribute],
    childList: true,
    subtree: true,
  })

  // 观察者只看得到「变化之后」的值，挂载后先补读一次首帧
  useEffect(read, [read])

  return value
}
