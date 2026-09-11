import type { PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react'
import type { CodexPetConfig, DshPetConfig, PetConfig, PetProps, PetRef } from '../types'
import { useCallback, useEffect, useRef } from 'react'
import { detectPetKind } from '../config'
import { useConfig } from '../hooks/use-config'
import { useControllablePet } from '../hooks/use-controllable-pet'
import { useDoubleClick } from '../hooks/use-double-click'
import { CodexPet } from './codex-pet'
import { DshPet } from './dsh-pet'

/**
 * 合并 ref：宿主的 ref 原样转发（对象 ref 与回调 ref 都支持、回调返回的清理函数也照传），
 * 同时把同一个命令面句柄留在内部 ref 上 —— 内置双击要用它下发 `waving`。
 *
 * 这样 `<Pet config uri />` 不传 ref 时双击同样有效，传了 ref 的宿主也不受影响。
 */
function useMergedRef(hostRef: Ref<PetRef | null> | undefined, innerRef: RefObject<PetRef | null>): Ref<PetRef | null> {
  return useCallback((node: PetRef | null) => {
    innerRef.current = node
    if (typeof hostRef === 'function') {
      const cleanup = hostRef(node)
      if (typeof cleanup === 'function') {
        return () => {
          innerRef.current = null
          cleanup()
        }
      }
      return
    }
    if (hostRef !== null && hostRef !== undefined)
      (hostRef as RefObject<PetRef | null>).current = node
  }, [hostRef, innerRef])
}

/**
 * **桌宠统一入口** —— 按 `config` / `uri` 自动判定渲染器，也可以 `kind` 强制指定。
 *
 * 判定规则（见 `detectPetKind`）：
 * - dsh-pet `config.jsonc`（有 `animations` / `pets` / …）→ `DshPet`（透明视频）
 * - Codex `pet.json`（有 `spriteVersionNumber` / `spritesheetPath` / …）→ `CodexPet`（雪碧图集）
 * - 两种都像或都不像时看 `uri`：图片扩展名 = Codex，`{ default, mac }` 对象 = dsh-pet
 *
 * 配置加载在这里统一做（URL 形态先拉一次），所以判定发生在拿到真实配置之后，
 * 不会因为「猜错渲染器」而闪一下；`ref` 与内部命令面 ref 合并后透传给被选中的渲染器，
 * `useControllablePet` 的命令面在两种渲染器上完全一致。
 *
 * **双击是内置行为**：命中框上两次按下间隔小于 `DOUBLE_CLICK_MS` 即插播一次
 * `waving`（dsh-pet 取 `animations.clicks` 池，Codex 走 `waving` 行），宿主不必自己判定；
 * 判定挂在你传入的 `onHitboxPointerDown` 之外，宿主自己的指针回调照常收到事件。
 *
 * ```tsx
 * const petRef = useRef<PetRef>(null)
 * const pet = useControllablePet(petRef)
 *
 * return (
 *   <Pet
 *     ref={petRef}
 *     config="/pets/main/config.jsonc"
 *     uri={{ default: '/pets/main/webm' }}
 *   />
 * )
 * ```
 */
export function Pet(props: PetProps) {
  const { kind, config, uri, ext, lookAtPointer, lookDeadzone, ref, motion, ...common } = props
  const { config: loaded, error } = useConfig<PetConfig>(config)
  const { onError } = common
  // 内部命令面（内置双击要下发动作）：宿主没传 ref 时也能用，传了就与宿主 ref 合并转发
  const innerRef = useRef<PetRef | null>(null)
  const mergedRef = useMergedRef(ref, innerRef)
  const pet = useControllablePet(innerRef)

  useEffect(() => {
    if (error !== null)
      onError?.(error)
  }, [error, onError])

  // 地址形态的配置还在路上时，先用原始 source 交给子渲染器（配置缓存会去重，不会重复拉）
  const resolved = loaded ?? config
  const resolvedKind = kind ?? detectPetKind(loaded, uri)

  // 点击回应：命中框上连按两次 → 插播一次 waving（`replay` 不能省，否则同动作会被去重）；
  // 拖动会话会作废判定窗口，所以「拖一下再快速点一下」不算双击
  const onDoubleClick = useDoubleClick(
    () => pet.motion({ type: 'waving', replay: true }),
    { interrupted: common.dragging === true },
  )

  // 内置判定只做叠加：先判双击，再把原生指针事件原样透传给宿主的回调
  const onHitboxPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onDoubleClick()
    common.onHitboxPointerDown?.(event)
  }

  if (resolvedKind === 'codex') {
    return (
      <CodexPet
        {...common}
        motion={motion}
        ref={mergedRef}
        onHitboxPointerDown={onHitboxPointerDown}
        config={resolved as CodexPetConfig}
        uri={typeof uri === 'string' ? uri : uri?.default}
        lookAtPointer={lookAtPointer}
        lookDeadzone={lookDeadzone}
      />
    )
  }
  const isMoving = (motion === 'moving-left' || motion === 'moving-right') && common.dragging
  return (
    <DshPet
      {...common}
      motion={isMoving ? undefined : motion}
      ref={mergedRef}
      onHitboxPointerDown={onHitboxPointerDown}
      config={resolved as DshPetConfig}
      uri={typeof uri === 'string' ? { default: uri } : (uri ?? { default: '' })}
      ext={ext}
    />
  )
}
