# dsh-pet-component

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

统一跨协议桌宠 React 组件：只需更换 `config` 或 `uri` 即可无缝切换底层协议，无需宿主编写额外的分支逻辑。

| 协议名称 | 配置文件 | 资源文件 |
| :--- | :--- | :--- |
| **[dsh-pet](https://github.com/PC2005-cloud/dsh-pet)** | `assets/config.jsonc` | 逐动作透明视频（VP9-alpha `.webm` / macOS HEVC-alpha `.mov`） |
| **[Codex Pet](https://github.com/Signalight/codex-to-dsh-pet)** | `pet.json` | 8 列单图雪碧图（192×208，9 行 v1 / 11 行 v2） |

---

## ✨ 核心特性

- **统一入口**：根据 `config` 结构自动识别渲染器，亦可显式设置 `kind` 参数强行指定。
- **无缝无黑帧**：内置双 `<video>` 交叉淡入缓冲机制，新动画加载完（`loadeddata`）后才切换至前台。
- **同构动作池**：内置 14 个同构动作（覆盖 dsh-pet 的 `workStatus` 档位），集成默认循环语义。
- **双模控制**：支持声明式（`motion` prop）与命令式（`pet.motion(...)` 插播）混合使用。
- **智能拖拽分流**：dsh-pet 播放「悬空拽起」动画，Codex 智能切为「左右行走」模式；命中区独立安全隔离。
- **内置双击**：命中框连按两次即插播 `waving`（dsh 取 `animations.clicks` 池，Codex 走 `waving` 行），宿主无需自己判定。
- **跨会话缓存**：内置 IndexedDB 缓存机制（`cache` 默认开启），实现 Blob 与 Object URL 跨会话复用。

---

## 📦 安装

```bash
pnpm add dsh-pet-component react
```

> **注意**：`react >= 19` 作为对等依赖（Peer Dependency）。

---

## 🚀 快速上手

```tsx
import { Pet, useConfig } from 'dsh-pet-component'

export function App() {
  const { config } = useConfig('https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/config.jsonc')

  return (
    <Pet
      size={300}
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

> `config` 属性亦可直接传入配置对象以跳过 `useConfig` 异步加载。

---

## 💡 进阶指南

### 外部控制与插播机制

使用 `useControllablePet` hook 可实现动作命令式下发。命令优先级**高于** `motion` prop，并持续有效直至 `motion` 值改变。

```tsx
import type { PetRef } from 'dsh-pet-component'
import { Pet, useControllablePet } from 'dsh-pet-component'
import { useRef } from 'react'

export function App() {
  const petRef = useRef<PetRef>(null)
  const pet = useControllablePet(petRef)

  // 命令控制模式
  pet.motion({ type: 'thinking', loop: true }) // 1. 强制循环播放
  pet.motion({ type: 'result' })               // 2. 播放一次后自动回落到 idle
  pet.motion({ type: 'waving', replay: true }) // 3. 强制重播同一动作
  pet.clear()                                  // 4. 清除命令层，回落至 motion prop 状态

  return <Pet ref={petRef} config={config} uri={{ default: '/pets/main/webm' }} />
}
```

**混合状态工作流：**

```tsx
// 声明当前工作状态
<Pet motion={{ type: 'working', loop: true }} ref={petRef} /> 

// 命令式插播事件
pet.motion({ type: 'waving' }) // 临时插播：挥手
pet.clear()                    // 撤销插播，无缝自动回落至 'working'
```

### 拖拽交互

拖拽属于最高优先级的**手势态**。可通过 `dragging` prop 显式指定，或使用 `pet.motion({ type: 'dragging' })` 下发：

| 维度 | dsh-pet | Codex Pet |
| --- | --- | --- |
| **拖拽表现** | 循环播放 `animations.drag`（被无形抓起悬空） | 根据移动方向自动切为左右行走 |
| **走路素材** | 使用 `animations.moves`（`moving-left` / `moving-right`） | 复用同一套行走向素材 |

容器推移可配合 [@reaxuse/core](https://github.com/hairyf/reaxuse) 的 `useDraggable` 使用：

```tsx
import { useDraggable } from '@reaxuse/core'
import { useRef } from 'react'

export function App() {
  const boxRef = useRef<HTMLDivElement>(null)
  const hitboxRef = useRef<HTMLDivElement>(null)

  const { x, y, isDragging } = useDraggable(boxRef, {
    handle: hitboxRef, // 仅允许命中框起拖
    initialValue: { x: 80, y: 80 },
  })

  return (
    <div ref={boxRef} style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none' }}>
      <Pet config={config} dragging={isDragging} hitboxRef={hitboxRef} ref={petRef} uri={uri}/>
    </div>
  )
}
```

> **事件拦截设计**：视频容器设置 `pointer-events: none`，仅 `.dsh-pet__hitbox` 接收指针事件。
> **安装提示**：`@reaxuse/core` 为内部依赖，但在 strict node_modules（如 pnpm）环境中需单独显式声明安装：`pnpm add @reaxuse/core`。

### 双击交互

双击是**「点击回应」手势**，`<Pet>` 已内置判定：命中框上两次按下间隔小于 500ms 即插播一次 `pet.motion({ type: 'waving', replay: true })`，宿主不需要自己接线。协议差异全部由组件抹平：

| 维度 | dsh-pet | Codex Pet |
| --- | --- | --- |
| **双击表现** | 从 `animations.clicks` 池抽一条播放（`motion: 'waving'`） | 播 `waving` 行（row 3，4 帧 × 140ms） |
| **回落语义** | 单次触发类（`loop: false`），播完回落 `idle` | 同左 |

* **只认双击**：单击不发任何动作，不会与状态动画、拖拽抢画面；`replay: true` 保证连按两次都能从头播。
* **松手才落地**：命中在第二次按下的 `pointerup` 才触发；传了 `dragging` 时，窗口内一旦变成拖动就作废窗口并丢掉待定的那次 ——「点一下 → 500ms 内又拖一下」不会误播。
* **与宿主回调共存**：内置判定叠加在你传入的 `onHitboxPointerDown` / `onHitboxPointerUp` / `onHitboxPointerCancel` 之外，宿主自己的指针回调照常收到事件。
* **实现**：判定窗口用 [@reaxuse/core](https://github.com/hairyf/reaxuse) 的 `useStateAutoReset` 表达，见 `src/hooks/use-double-click.ts`。

---

## 📚 API 参考

组件包仅暴露以下核心导出，底层复杂的资源解析、JSONC 解析、视频缓冲控制等细节已做封装隔离。

```ts
export { Pet, useConfig, useControllablePet } from 'dsh-pet-component'

```

### `<Pet />` Props

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `config` | `string | DshPetConfig | CodexPetConfig` | — | 配置对象或 `.json` / `.jsonc` URL 地址 |
| `uri` | `string | { default: string; mac?: string }` | — | 资源基地址（dsh 使用对象，Codex 使用字符串） |
| `kind` | `'dsh' | 'codex'` | *自动识别* | 强制指定渲染器类型 |
| `ext` | `{ default: string; mac?: string }` | `{ default: 'webm', mac: 'mov' }` | dsh 视频资源扩展名（Codex 自动忽略） |
| `size` | `number` | `462` (dsh) / `231` (Codex) | 渲染宽度 (px)，高度自适应推算 |
| `motion` | `Motion | MotionOptions` | `'idle'` | 声明式动作状态（命令层清除后的回落值） |
| `dragging` | `boolean` | `false` | 拖拽手势状态（优先级高于 `motion`） |
| `cache` | `boolean` | `true` | 是否启用 IndexedDB 资源持久化缓存 |
| `mirrored` | `boolean` | `false` | 是否开启水平翻转镜像 |
| `hidden` | `boolean` | `false` | 隐藏元素而非卸载 DOM（保持媒体上下文常驻） |
| `lookAtPointer` | `boolean` | `true` | *(仅 Codex v2)* `idle` 状态下根据指针方向选择视线帧 |
| `lookDeadzone` | `number` | `24` | *(仅 Codex)* 视线选择死区半径 (px) |
| `hitboxRef` | `Ref<HTMLDivElement>` | — | 绑定命中框 DOM Ref |
| `onHitboxPointerDown / Up / Cancel` | `(e: PointerEvent) => void` | — | 命中框指针原生地事件透传回调 |
| `onMotionChange` | `(motion: PetRenderMotion) => void` | — | 实际动作变更回调（包含自动回落 `idle`） |
| `onAnimationChange` | `(info: PetAnimationInfo | null) => void` | — | 底层播放动画变更回调，常用于埋点或测试 |
| `onReady` | `() => void` | — | 资源加载就绪回调 |
| `onError` | `(error: unknown) => void` | — | 资源加载或播放异常回调 |
| `ref` / `className` / `style` | — | — | 标准命令控制 Ref 及常规 DOM 属性透传 |

### `useConfig`

```ts
const { config, error, loading } = useConfig<PetConfig>(url)

```

* **同步模式**：传入配置对象时直接返回。
* **异步模式**：传入 URL 时首帧返回 `{ config: null, loading: true }`，支持 SSR 安全；内置去重，多个实例请求同一 URL 仅执行一次 Fetch。

### `useControllablePet`

```ts
const pet = useControllablePet(petRef)
```

| 接口 / 属性 | 类型 | 描述 |
| --- | --- | --- |
| `motion` | `(input: MotionInput) => void` | 手动下发动作命令；`loop` 默认取动作语义，`replay: true` 强制重新触发播放 |
| `clear` | `() => void` | 清空命令层，使动作回落至当前 `motion` prop 参数 |
| `current` | `PetRenderMotion` | **[只读]** 当前生效的动作状态（包含 `dragging`） |

---

## 🎭 动作映射规约

统一抽象了 **14 个内置动作**，统一采用连字符小写（kebab-case）命名：

```text
idle        turn       moving-left   moving-right   waving     thinking 
working     result     waiting       running        review     failed 
success     error
```

* **常驻循环类**：`idle`、`moving-left`、`moving-right`、`thinking`、`working`、`result`、`waiting`、`running`，以及手势态 `dragging`。
* **单次触发类**：除上述外，其余动作在播放一次后会自动回落到 `idle`（可通过 `loop: true` 覆盖）。
* **粗粒度别名**：`running` / `review` / `failed` 会自动映射归类至 `working` / `result` / `error`。

---

## ⚙️ 配置示例

### dsh-pet 配置 (JSONC)

在 dsh-pet 中，底层资源与动作的映射关系如下：

```jsonc
{
  "animations": {
    "idle": ["待机呼吸休闲"],
    "turn": ["东张西望"],
    "drag": ["被鼠标拖拽悬空反馈"], // → 对应手势态 dragging
    "clicks": ["点击回应-开心跃动"], // → 对应 waving 动作
    "moves": { 
      "actions": [{ "name": "螃蟹走路" }] 
    },                          // → 对应 moving-left / moving-right
    "events": {
      // workStatus 对应索引：0:thinking | 1:working | 2:result | 3:waiting | 4:success | 5:error
      "workStatus": [
        "工作状态-思考冒泡", 
        "工作状态-忙碌点按", 
        "工作状态-清点归档", 
        "工作状态-原地踱步张望", 
        "工作状态-雀跃庆祝", 
        "工作状态-垂头叹气冒汗"
      ]
    }
  },
  "animationWeights": { "idle": 10, "turn": 5, "move": 5 }
}
```

也可以通过 `motions` 显式覆写指定映射关系（优先级最高）：

```jsonc
{ 
  "motions": { 
    "idle": "待机呼吸休闲", 
    "working": ["忙碌点按", "写代码"], 
    "dragging": "被鼠标拖拽悬空反馈" 
  } 
}
```

### Codex Pet 配置 (`pet.json`)

支持原生 `pet.json` 属性（`id`, `displayName`, `spriteVersionNumber`, `spritesheetPath`）。可通过 `motions` 自定义指定行号与帧配置：

```json
{
  "motions": {
    "idle": 0,
    "working": { "row": 3, "frames": 8, "interval": 100, "loop": true }
  }
}
```

---

## 🛠 本地开发与测试

### Playground 运行

```bash
pnpm install
cd playground && pnpm dev
```

> **演练场亮点**：提供单 `<Pet>` 实时预览环境，支持动态切换协议渲染器（dsh-pet / Codex）、测试动作墙与插播控制、调试拖拽机制与命中框，以及监控媒体状态指标。

### 构建与构建检查

```bash
pnpm run typecheck   # TypeScript 类型检查
pnpm run lint        # ESLint 代码风格规范检查
pnpm test            # 单元测试 (Vitest，包含 API 快照测试)
pnpm run build       # 构建产物生成 (tsdown → dist/)
```

---

## 📄 开源许可证

[MIT License](https://www.google.com/search?q=./LICENSE.md) © [Hairyf](https://github.com/hairyf)