# dsh-pet-component

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

把两套桌宠协议封装成**一个** `<Pet>`：

| 协议 | 配置 | 资源形态 |
| --- | --- | --- |
| [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | `assets/config.jsonc` | 逐动作透明视频（VP9-alpha `.webm`；macOS 用 HEVC-alpha `.mov`） |
| Codex Pet | `pet.json` | 单张 8 列雪碧图（格子 192×208，9 行 v1 / 11 行 v2） |

换 `config` / `uri` 就换协议 —— 宿主不写分支。两套协议的播放细节都在组件内部：
切动作走**双 `<video>` 缓冲交叉淡入**（无空窗、无黑帧），拖动时 dsh-pet 播
「被无形抓起悬空」、Codex 播左右行走动画。

## 对外 API

只有三件东西（其余都是实现细节）：

```ts
export { Pet } from 'dsh-pet-component'                 // 组件
export { useConfig } from 'dsh-pet-component'           // 加载配置
export { useControllablePet } from 'dsh-pet-component'  // 命令面
```

外加消费这三个东西所需的类型（`PetProps` / `PetRef` / `PetConfig` / `DshPetConfig` /
`CodexPetConfig` / `Motion` / `MotionInput` / `PetAnimationInfo` / `PetConfigResult` …）。

## 安装

```bash
pnpm add dsh-pet-component react
```

`react >= 19` 是 peer 依赖。

## 快速开始

```tsx
import { Pet, useConfig } from 'dsh-pet-component'

export function App() {
  const { config } = useConfig('https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/config.jsonc')
  const [size, setSize] = useState(config.size)

  return (
    <Pet
      size={size}
      config={config}
      ext={{ default: 'webm', mac: 'mov' }}
      uri={{
        default: 'https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/webm',
        mac: 'https://raw.githubusercontent.com/dsh-tauri-desk/dsh-pet-mov/refs/heads/main/mov',
      }}
      cache
    />
  )
}
```

`config` 可以直接给对象（跳过 `useConfig`）。实现细节与设计取舍见 [`docs/api.md`](./docs/api.md)。

## 外部更改动作

```tsx
import type { PetRef } from 'dsh-pet-component'
import { Pet, useControllablePet } from 'dsh-pet-component'
import { useRef } from 'react'

export function App() {
  const petRef = useRef<PetRef>(null)
  const pet = useControllablePet(petRef)

  pet.motion({ type: 'thinking', loop: true }) // 思考动作，循环播放
  pet.motion({ type: 'result' }) // 结果动作，播放一次后自动切换为 idle
  pet.clear() // 撤销命令面下发的动作（没传 motion prop 就是回 idle）

  return <Pet ref={petRef} config={config} uri={{ default: '/pets/main/webm' }} />
}
```

14 个动作：`idle` `turn` `moving-left` `moving-right` `waving` `thinking` `working`
`result` `waiting` `running` `review` `failed` `success` `error`。
其中 `thinking/working/result/waiting` 与 `idle`、移动档常驻循环，其余播一次后回落 `idle`
（可用 `loop` 覆盖）。

`motion` prop 与命令面**可以共存**，命令面优先：

```tsx
<Pet motion={{ type: 'working', loop: true }} ref={petRef} /> // 声明：正在干活
pet.motion({ type: 'waving' })                                 // 插播：挥手（覆盖声明值）
pet.clear()                                                    // 撤销插播，回落到 working
```

命令面下发过的动作一直生效，直到 `motion` 的取值发生变化 —— 那时命令层被清掉、声明值重新接管。
同一动作重复下发默认不重播（会话状态反复上报不该让动画一直从头播），要重播用
`pet.motion({ type: 'waving', replay: true })`。

## 尺寸

`size` 是**显示宽度 px**，高度按资源推算（视频 9/16，图集 208/192）。
缺省时两种协议的基准不同：dsh-pet 取 462px（16:9 画布基准），Codex 取它的一半 231px ——
图集格子里人物基本铺满，视频画布里人物只占中间一块，同宽下 Codex 会大出约一倍。

## 拖动与走路

**拖动**是手势态，走独立的 `dragging` prop（优先级最高，也可以用
`pet.motion({ type: 'dragging' })` 下发）。两个渲染器各自用协议里正确的素材：

| | dsh-pet | Codex Pet |
| --- | --- | --- |
| 拖动表现 | `animations.drag` 的「被无形抓起悬空」（循环） | 按方向播左右行走行 |
| 原因 | 被无形抓起就是 `drag` 池的契约 | 图集 9/11 行里没有拖拽悬浮行 |

**走路素材是另一套**：`moving-left` / `moving-right` 在 dsh-pet 侧取
`animations.moves.actions`（螃蟹走路 / 原地漂浮踏步 / 原地左转奔跑…），**与拖动完全分开**。
本组件不掌管窗口位置、不替宿主驱动漫游，所以这两个动作不会自动触发 ——
宿主自己移动宠物时，用命令面或 `motion` prop 手动下发即可：

```tsx
const petRef = useRef<PetRef>(null)
const pet = useControllablePet(petRef)

pet.motion({ type: 'moving-right', loop: true })  // 开始走 → 播走路素材
pet.motion({ type: 'moving-left', loop: true })   // 换向 → 镜像 + 继续走
pet.motion({ type: 'idle', loop: true })          // 停下
```

Codex 侧没有独立的走路池，`moving-left` / `moving-right` 就是图集的左右行走行
（拖动的方向也落在同一对行上）。

**拖动区只有命中框**：组件把 `pointer-events: auto` 只给 `hitboxRef` 指向的
`.dsh-pet__hitbox`（尺寸与 dsh-pet 的 `.dsh-pet-hit` 一致，就是宠物身体那一块），
视频/图集区域不接收指针事件。宿主若把宠物包在「被移动的容器」里，那个容器要
`pointer-events: none` 且不要自己加 grab 光标，否则整盒看起来能拖、实际只有命中框能起拖。

```tsx
function DragDemo({ drag, hitboxRef, boxRef }) {
  return (
    <div ref={boxRef} style={{ position: 'absolute', left: drag.x, top: drag.y, pointerEvents: 'none' }}>
      <Pet
        ref={petRef}
        config={config}
        uri={uri}
        dragging={drag.isDragging}     // 拖动：悬空（dsh）/ 左右行走行（Codex）
        hitboxRef={hitboxRef}          // 只有命中框能起拖
      />
    </div>
  )
}
}
```

拖拽机械部分与 `motion` 一样是宿主的事（`onHitboxPointerDown` / `hitboxRef` 都只是透传），
playground 里用了一个 VueUse `useDraggable` 的移植做示范。

## 配置文件

`config` 既可以是对象，也可以是 `.json` / `.jsonc` 地址（用 `fetch` 拉取并剥注释、去尾逗号）。

dsh-pet 协议里「动画池条目 = 动画名 = 资源文件名主名」，组件负责把它们映射到动作：

```jsonc
{
  "animations": {
    "idle": ["待机呼吸休闲"],
    "turn": ["东张西望"],
    "drag": ["被鼠标拖拽悬空反馈"], // → dragging（拖动唯一使用的池）
    "clicks": ["点击回应-开心跃动"], // → waving
    "moves": { "actions": [{ "name": "螃蟹走路" }] }, // → moving-left / moving-right（走路素材）
    "events": {
      "workStatus": [ // 索引 = 档位
        "工作状态-思考冒泡", // 0 thinking
        "工作状态-忙碌点按", // 1 working
        "工作状态-清点归档", // 2 result
        "工作状态-原地踱步张望", // 3 waiting
        "工作状态-雀跃庆祝", // 4 success
        "工作状态-垂头叹气冒汗" // 5 error
      ]
    }
  },
  "animationWeights": { "idle": 10, "turn": 5, "move": 5 }
}
```

不想用池，也可以直接写死动作映射（`motions` 优先级最高，同样支持 `dragging`）：

```jsonc
{ "motions": { "idle": "待机呼吸休闲", "working": ["忙碌点按", "写代码"], "dragging": "被鼠标拖拽悬空反馈" } }
```

Codex 协议的 `pet.json`（`id` / `displayName` / `spriteVersionNumber` / `spritesheetPath`）
直接可用；细分工作档会近似落到图集既有的 9 行上。

## Playground

```bash
pnpm install
cd playground && pnpm dev
```

Playground 有**一份演示组件**（`playground/src/components/demo.tsx`），而且
**只用一个 `<Pet>`**：顶部切素材（dsh-pet 的 `config.jsonc` + webm ↔ Codex 的 `pet.json` +
雪碧图），`Pet` 自动换底层渲染器 —— 宿主代码不写分支。其余能力全在同一个面板里：
动作墙、命令面插播、按协议分流的拖动（勾「显示命中框」可以看到拖动区就是
`dsh-pet__hitbox`）、点击回应、每个素材各自的尺寸 / 缓存 / 镜像 / look 开关、
单条动画的媒体控制面板，以及全部只读回显。

包的公开面就是上面那三个；playground 自己的东西（拖动、偏好存储、媒体控制、
播放器组件）都放在 `playground/src`：

| 在 playground 里 | 用什么 |
| --- | --- |
| 组件 / 配置 / 命令面 | `Pet` / `useConfig` / `useControllablePet`（包） |
| 拖动宠物 | playground 里的 VueUse `useDraggable` 移植 + `use-pet-drag`（阈值 / 方向 / 双击判定） |
| 偏好持久化 | playground 里的 `useLocalStorage` 移植 |
| 单条动画播放器 | playground 里的 `useMediaControls` 移植 + `media-player.tsx` |

包用 tsdown 的 `devExports` 声明开发期入口，playground 直接按包名
`dsh-pet-component` 引进库源码 —— 不需要 alias，HMR 同时覆盖库与 playground。

## 开发

```bash
pnpm run typecheck   # tsc
pnpm run lint        # eslint
pnpm test            # 先构建，再跑 vitest（含公共 API 快照）
pnpm run build       # tsdown → dist/
```

## Note for Developers

This starter recommands using [npm Trusted Publisher](https://github.com/e18e/ecosystem-issues/issues/201), where the release is done on CI to ensure the security of the packages.

To do so, you need to run `pnpm publish` manually for the very first time to create the package on npm, and then go to `https://www.npmjs.com/package/<your-package-name>/access` to set the connection to your GitHub repo.

Then for the future releases, you can run `pnpm run release` to do the release and the GitHub Actions will take care of the release process.

## License

[MIT](./LICENSE) License © [Anthony Fu](https://github.com/hairyf)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/dsh-pet-component?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/dsh-pet-component
[npm-downloads-src]: https://img.shields.io/npm/dm/dsh-pet-component?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmx.dev/package/dsh-pet-component
[bundle-src]: https://img.shields.io/bundlephobia/minzip/dsh-pet-component?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=dsh-pet-component
[license-src]: https://img.shields.io/github/license/hairyf/dsh-pet-component.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/hairyf/dsh-pet-component/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/dsh-pet-component
