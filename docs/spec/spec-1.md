## 组件设计(dsh-pet)

```tsx
type Motion = 'idle' | 'turn' | 'moving-left' | 'moving-right' | 'waving' | 'thinking' | 'working' | 'result' | 'waiting' | 'running' | 'review' | 'failed' | 'success' | 'error'

const PET_DEFAULT_SIZE_PERCENT = 100
// ...

export interface DshPetConfig {
  // ...
}

export interface PetProps {
  size?: number
  // dsh-pet 的配置文件地址或对象
  config: string | DshPetConfig
  // dsh-pet 资源文件的后缀名，默认 webm，macOS 下为 mov
  ext: { default: string, mac?: string }
  // dsh-pet 资源文件的地址，默认 webm，macOS 下为 mov
  uri: { default: string, mac?: string }
  // 当前播放的动作，默认 idle
  motion?: Motion
  /** 是否开启 Web IndexedDB 缓存，默认 true */
  cache?: boolean
  /** 点击碰撞箱 Ref */
  hitboxRef?: Ref<HTMLDivElement>
  /** Hitbox 指针事件绑定 */
  onHitboxPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  onHitboxPointerUp?: (e: PointerEvent<HTMLDivElement>) => void
  onHitboxPointerCancel?: (e: PointerEvent<HTMLDivElement>) => void
}
export function Pet(props: PetProps) {
  // ...
}
```

组件实例：



```tsx
return (
  <CodexPet
    config="https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/config.jsonc"
    ext={{ default: 'webm', mac: 'mov' }}
    uri={{
      default: 'https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/webm',
      mac: 'https://raw.githubusercontent.com/dsh-tauri-desk/dsh-pet-mov/refs/heads/main/mov',
    }}
    cache={true}
  />
)
```

## 组件设计(codex-pet)


```tsx
export interface CodexPetConfig {
  // ...
}

export interface CodexPetProps {
  size?: number
  // codex-pet 的配置文件地址或对象
  config: string | CodexPetConfig
  // codex-pet 资源文件的地址(webp)
  uri: string
  // 当前播放的动作，默认 idle
  motion?: Motion
  /** 是否开启 Web IndexedDB 缓存，默认 true */
  cache?: boolean
  /** 碰撞箱 Ref */
  hitboxRef?: Ref<HTMLDivElement>
  /** Hitbox 指针事件绑定 */
  onHitboxPointerDown?: (e: PointerEvent<HTMLDivElement>) => void
  onHitboxPointerUp?: (e: PointerEvent<HTMLDivElement>) => void
  onHitboxPointerCancel?: (e: PointerEvent<HTMLDivElement>) => void
}
export function CodexPet(props: CodexPetProps) {
  // ...
}
```

```tsx
return (
  <CodexPet
    config="xxx/pet.json"
    uri="xxx/spritesheet.webp"
  />
)
```


## 外部更改动作

```tsx
const petRef = useRef<PetRef>(null)
const pet = useControllablePet(petRef)
pet.motion({ type: 'thinking', loop: true }) // 设置宠物为思考动作，循环播放
pet.motion({ type: 'result' }) // 设置宠物为结果动作，播放一次后自动切换为 idle
pet.clear() // 清除当前动作，切换为 idle

return (
  <Pet ref={petRef} />
  // or
  <CodexPet ref={petRef} />
)
```