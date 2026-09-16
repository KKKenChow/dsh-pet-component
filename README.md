# dsh-pet-component

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

统一跨协议桌宠 React 组件：只需更换 `config` 或 `uri` 即可无缝切换底层协议，无需宿主编写额外的分支逻辑。

| 协议名称 | 配置文件 | 资源文件 |
| :--- | :--- | :--- |
| **[Dsh Pet](https://github.com/PC2005-cloud/dsh-pet)** | `assets/config.jsonc` | 逐动作透明视频（VP9-alpha `.webm` / macOS HEVC-alpha `.mov`） |
| **[Codex Pet](https://github.com/Signalight/codex-to-dsh-pet)** | `pet.json` | 8 列单图雪碧图（192×208，9 行 v1 / 11 行 v2） |

---

## ✨ 核心特性

- 🧭 **统一入口**：根据 `config` 结构自动识别渲染器，亦可显式设置 `kind` 参数强行指定。
- 🎬 **无缝无黑帧**：内置双 `<video>` 交叉淡入缓冲机制，新动画加载完（`loadeddata`）后才切换至前台。
- 🎭 **同构动作池**：内置 14 个同构动作（覆盖 dsh-pet 的 `workStatus` 档位），集成默认循环语义。
- 🎮 **双模控制**：支持声明式（`motion` prop）与命令式（`pet.motion(...)` 插播）混合使用。
- 🖱️ **智能拖拽分流**：dsh-pet 播放「悬空拽起」动画，Codex 智能切为「左右行走」模式；命中区独立安全隔离。
- ⚡ **内置双击**：连按两次即插播 `waving`（dsh 取 `animations.clicks` 池，Codex 走 `waving` 行）
- 💾 **跨会话缓存**：内置 IndexedDB 缓存机制（`cache` 默认开启），实现 Blob 与 Object URL 跨会话复用。
- 🍎 **多平台适配**：macOS 自动走 HEVC-alpha 资源，其余平台走 VP9-alpha；自动探测切换，宿主无需编写任何分支逻辑。

> Web IndexedDB 可能需要处理 CORS 的情况，所以 IndexedDB 缓存不太适用纯浏览器的场景

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

查看在线浏览：https://dsh-pet-component.vercel.app/

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

容器推移可配合 [@reause/core](https://reause.netlify.app/core/useDraggable/) 的 `useDraggable` 使用：

```tsx
import { useDraggable } from '@reause/core'
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
> **安装提示**：`@reause/core` 为内部依赖，但在 strict node_modules（如 pnpm）环境中需单独显式声明安装：`pnpm add @reause/core`。

### 双击交互

双击是**「点击回应」手势**，`<Pet>` 已内置判定：命中框上两次按下间隔小于 500ms 即插播一次 `pet.motion({ type: 'waving', replay: true })`，宿主不需要自己接线。协议差异全部由组件抹平：

| 维度 | dsh-pet | Codex Pet |
| --- | --- | --- |
| **双击表现** | 从 `animations.clicks` 池抽一条播放（`motion: 'waving'`） | 播 `waving` 行（row 3，4 帧 × 140ms） |
| **回落语义** | 单次触发类（`loop: false`），播完回落 `idle` | 同左 |

* **只认双击**：单击不发任何动作，不会与状态动画、拖拽抢画面；`replay: true` 保证连按两次都能从头播。
* **松手才落地**：命中在第二次按下的 `pointerup` 才触发；传了 `dragging` 时，窗口内一旦变成拖动就作废窗口并丢掉待定的那次 ——「点一下 → 500ms 内又拖一下」不会误播。
* **与宿主回调共存**：内置判定叠加在你传入的 `onHitboxPointerDown` / `onHitboxPointerUp` / `onHitboxPointerCancel` 之外，宿主自己的指针回调照常收到事件。
* **实现**：判定窗口用 [@reause/core](https://github.com/hairyf/reause) 的 `useStateAutoReset` 表达，见 `src/hooks/use-double-click.ts`。

### 气泡与碎碎念

**气泡**（`pet.bubble`）是纯展示层：宿主管内容，组件管叠加、原地更新、定时收起与捆绑运行动画。观感对齐桌面端（`deepseek-harness-desktop`）的 toast：标题与正文 14px（标题 medium）、正文两行截断、24px 圆角、语义色只染标题与图标（图标直接取自 `@gravity-ui/icons` —— `CircleInfo` / `CircleCheck` / `TriangleExclamation` / `CircleExclamation`，加载态是 HeroUI 的 `Spinner`）。整组度量按宠物实测宽度（`--dsh-pet-size`）等比缩到与宠物合身，多条时按 toast 的层叠规则叠放（缩放系数 0.05、间距 12px，越旧越靠后）。

```ts
const key = pet.bubble({ id: 's1', title: '会话标题', description: '正在分析代码…', loading: true, motion: 'thinking' })

// 同一个 id 再下发 = 原地更新：只换内容，不重新淡入、不重置收起计时
pet.bubble({ id: 's1', description: '分析完成：改了 3 个文件', loading: false, variant: 'success', motion: 'success' })

pet.bubble.close('s1') // 不给 id = 收起最近一条
pet.bubble.clear()
```

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 自增 | 稳定 key；同 id 再次下发即原地更新 |
| `title` / `description` / `icon` | `ReactNode` | — | 标题行 / 正文（可更新文字）/ 图标槽 |
| `image` | `string` | — | 配图地址（宿主给完整 URL） |
| `loading` | `boolean` | `false` | 显示内置 CSS 圆环（加载态） |
| `variant` | `'default' \| 'success' \| 'warning' \| 'danger'` | `'default'` | 语义色，决定内置图标与默认收起时长 |
| `motion` | `MotionInput` | — | 会话档位；状态机按 `STATUS_PRIORITY` 表聚合（含终态脉冲窗口）后声明式交给 `<Pet>` |
| `timeout` | `number` | 按档位 | 自动收起 ms（`success` 3000 / `failed`·`error` 4000 / `review` 2500；其余档位常驻） |
| `placement` | `'top' \| 'bottom'` | `'top'` | 相对宠物的方向 |

同时最多显示 **3 条**，超出关最旧（对齐桌面端 `MAX_VISIBLE_TOASTS`）。气泡层由 `<Pet>` 自己挂在 `.dsh-pet-shell` 上 —— `DshPet` / `CodexPet` 两个渲染器里没有任何气泡逻辑。

**碎碎念**（`muttering`）是触发层：组件管节拍与提示词，宿主管模型生成 —— 与 dsh-pet 的分工一致。

```tsx
<Pet
  config={config}
  uri={uri}
  muttering                  // 缺省回落 config 的 pets[i].whisperEnabled
  mutteringIntervalSec={300} // 缺省 config.eventsRefreshSec.whisper，再缺省 3600（下限 1 秒）
  mutteringImage             // 缺省回落 config.whisperImageEnabled
  onMuttering={(prompt, { petId, reason, intervalSec, meme }) => {
    generate(prompt, meme).then(text => pet.muttering(text, { image: meme && memeUrl(meme.name) }))
  }}
/>
```

* **首拍只记基线**：挂载后第一次到点以 `reason: 'baseline'` 通知宿主，且这期间推回的文本**不会展示**（对应 dsh-pet 的 `hasBaseline`，避免启动/刷新时重放旧句子）；`mutteringImmediate` 可关掉这个行为。
* **宿主推回才展示**：组件不持有 Promise。`pet.muttering(text, { image?, duration? })` 从 `animations.events.whisper` 整池随机抽一段动画播放（避开上一段），并弹一条 10s 气泡；这句话走 `title`（说话语气、不占图标位），配图走 `image`；池为空时回落 `mutteringMotion`（缺省 `waving` —— Codex 图集走这条）。
* **状态登记处与可见层是两层**（移植自参考实现的 `sessions` / toast 分层）：`pet.bubble({ id, motion })` 登记的档位留在状态机里，可见气泡每处最多 3 条 —— 被上限挤下去、或到点收起，都**只影响可见层**，动作照旧由登记的档位聚合。所以「三条叠加挤掉常驻的加载态」之后，加载动画仍然在（三条的终态脉冲过期后也是）。
* **终态档有独立的保持窗口**：`success` / `error` 的气泡 3s 收起，动作还留 10s（`failed` 1.8s）让动画完整播完 —— 上游注释里记的正是「成功动画没播完就换回待机」这个报告。
* **只有终态档会自己收起**：`success` 3000 / `failed`·`error` 4000 / `review` 2500，其余档位（工作档、等待档）常驻等状态变化；`loading: true` 一律回到 Info 档（对齐 `toastContent`：`isLoading` 只出现在 `default` 档位）。聚合下发还带 100ms 合并窗口，多会话交错时不会把动画反复切回。
* **状态压过闲聊**：出现非碎碎念气泡时碎碎念那条立即收起；插播（空闲风味动作 / 碎碎念动画）只在**纯待机**时播，状态动作一到就接手，不必等插播播完。加载态只挡**自动**碎碎念，手动 `pet.muttering(...)` / `pet.muttering.request()` 随时可用（说话优先：会先清掉状态气泡）。
* **配图**：开启后组件从 `config.memes` 随机抽 1 张（不让模型选），把 `{ name, desc }` 放进事件载荷供宿主拼提示词，图片 URL 由宿主给。
* **手动触发**：`pet.muttering.request()` 立即以 `reason: 'manual'` 再索取一句，绕过周期与首拍基线。
* **失败静默**：`onMuttering` 抛错只 `console.warn`，不打断周期、不弹错误气泡。

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
| `lookRadius` | `number` | `max(宽,高) × 1.25` | *(仅 Codex)* 视线作用半径 (px)；出界即回待机帧 |
| `hitboxRef` | `Ref<HTMLDivElement>` | — | 绑定命中框 DOM Ref |
| `onHitboxPointerDown / Up / Cancel` | `(e: PointerEvent) => void` | — | 命中框指针原生地事件透传回调 |
| `onMotionChange` | `(motion: PetRenderMotion) => void` | — | 实际动作变更回调（包含自动回落 `idle`） |
| `onAnimationChange` | `(info: PetAnimationInfo | null) => void` | — | 底层播放动画变更回调，常用于埋点或测试 |
| `onReady` | `() => void` | — | 资源加载就绪回调 |
| `onError` | `(error: unknown) => void` | — | 资源加载或播放异常回调 |
| `muttering` | `boolean` | *config* | 自动碎碎念开关；缺省回落 `config.pets[i].whisperEnabled`（上游缺省 `false`） |
| `mutteringPrompt` | `string` | *config* | 覆盖 `config.whisperPrompt`（碎碎念人设 / system 提示词） |
| `mutteringIntervalSec` | `number` | *config* / `3600` | 碎碎念周期（秒；下限 1 秒） |
| `mutteringImmediate` | `boolean` | `false` | 首拍即索取 —— 关掉 dsh-pet 的「首拍只记基线」 |
| `mutteringImage` | `boolean` | *config* | 是否抽配图；缺省回落 `config.whisperImageEnabled` |
| `mutteringDuration` | `number` | `10000` | 碎碎念气泡展示时长 ms（对齐 dsh-pet `BUBBLE_DURATION_MS`） |
| `mutteringMotion` | `MotionInput` | `'waving'` | `events.whisper` 池为空时的回落动作 |
| `onMuttering` | `(prompt: string, event: PetMutteringEvent) => void` | — | 「该要一句了」；宿主生成后调 `pet.muttering(text)` 推回 |
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
| `bubble` | `PetBubbleHandle` | 气泡命令面：`pet.bubble({…})` / `pet.bubble.close(id?)` / `pet.bubble.clear()` |
| `muttering` | `PetMutteringHandle` | 碎碎念命令面：`pet.muttering(text, { image?, duration? })` / `pet.muttering.request()` |

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
