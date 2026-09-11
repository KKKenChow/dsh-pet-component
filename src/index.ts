/**
 * dsh-pet-component —— 把 dsh-pet（逐动作透明视频）与 Codex Pet（精灵图集）两套桌宠协议
 * 封装成**一个** `<Pet>`：换 `config` / `uri` 就换协议，宿主不写分支。
 *
 * 对外只有三件东西：
 *
 * - `<Pet>`                   组件（`DshPet` / `CodexPet` 由它内部按配置选，不对外暴露）
 * - `useConfig(...)`          加载配置（对象直用；地址走带缓存的 fetch + JSONC 解析）
 * - `useControllablePet(...)` 命令面（`pet.motion(...)` / `pet.clear()`）
 *
 * ```tsx
 * const petRef = useRef<PetRef>(null)
 * const pet = useControllablePet(petRef)
 * const { config } = useConfig('/pets/main/config.jsonc')
 *
 * pet.motion({ type: 'thinking', loop: true })
 * pet.motion({ type: 'result' })   // 播一次后自动回 idle
 * pet.clear()
 *
 * return (
 *   <Pet
 *     ref={petRef}
 *     config={config}
 *     uri={{ default: '/pets/main/webm', mac: '/pets/main/mov' }}
 *     ext={{ default: 'webm', mac: 'mov' }}
 *     cache
 *   />
 * )
 * ```
 *
 * 其余（资源解析、JSONC、IndexedDB 缓存、双视频缓冲、帧循环、动作池拾取…）都是实现细节，
 * 不构成公开 API —— 需要时看 `docs/api.md` 的设计说明。
 */
export { Pet } from './components/pet'
export { useConfig } from './hooks/use-config'
export type { PetConfigResult } from './hooks/use-config'

export { useControllablePet } from './hooks/use-controllable-pet'
export type {
  AnimationSlot,
  Category,
  CodexPetConfig,
  CodexPetFrameSpec,
  DshPetAnimations,
  DshPetConfig,
  DshPetEntry,
  EventSlot,
  Motion,
  MotionInput,
  MotionOptions,
  MovesConfig,
  MoveSpec,
  PetAnimationInfo,
  PetCommonProps,
  PetConfig,
  PetConfigSource,
  PetCorner,
  PetDisplay,
  PetEvents,
  PetHitboxProps,
  PetProps,
  PetRef,
  PetRenderMotion,
  PetWeights,
  PhysicsParams,
} from './types'
