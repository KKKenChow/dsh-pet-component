import type { CodexPetConfig, DshPetConfig, PetConfig, PetProps } from '../types'
import { useEffect } from 'react'
import { detectPetKind } from '../config'
import { useConfig } from '../hooks/use-config'
import { CodexPet } from './codex-pet'
import { DshPet } from './dsh-pet'

/**
 * **桌宠统一入口** —— 按 `config` / `uri` 自动判定渲染器，也可以 `kind` 强制指定。
 *
 * 判定规则（见 `detectPetKind`）：
 * - dsh-pet `config.jsonc`（有 `animations` / `pets` / …）→ `DshPet`（透明视频）
 * - Codex `pet.json`（有 `spriteVersionNumber` / `spritesheetPath` / …）→ `CodexPet`（雪碧图集）
 * - 两种都像或都不像时看 `uri`：图片扩展名 = Codex，`{ default, mac }` 对象 = dsh-pet
 *
 * 配置加载在这里统一做（URL 形态先拉一次），所以判定发生在拿到真实配置之后，
 * 不会因为「猜错渲染器」而闪一下；`ref` 原样透传给被选中的渲染器，
 * `useControllablePet` 的命令面在两种渲染器上完全一致。
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

  useEffect(() => {
    if (error !== null)
      onError?.(error)
  }, [error, onError])

  // 地址形态的配置还在路上时，先用原始 source 交给子渲染器（配置缓存会去重，不会重复拉）
  const resolved = loaded ?? config
  const resolvedKind = kind ?? detectPetKind(loaded, uri)

  if (resolvedKind === 'codex') {
    return (
      <CodexPet
        {...common}
        motion={motion}
        ref={ref}
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
      ref={ref}
      config={resolved as DshPetConfig}
      uri={typeof uri === 'string' ? { default: uri } : (uri ?? { default: '' })}
      ext={ext}
    />
  )
}
