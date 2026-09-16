# dsh-pet-component

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

统一跨协议桌宠 React 组件：只需更换 `config` 或 `uri` 即可无缝切换底层渲染协议，无需宿主编写额外的分支逻辑。

| 协议名称 | 配置文件 | 资源文件 |
| --- | --- | --- |
| **[Dsh Pet](https://github.com/PC2005-cloud/dsh-pet)** | `assets/config.jsonc` | 逐动作透明视频（VP9-alpha `.webm` / macOS HEVC-alpha `.mov`） |
| **[Codex Pet](https://github.com/Signalight/codex-to-dsh-pet)** | `pet.json` | 8 列单图雪碧图（192×208，9 行 v1 / 11 行 v2） |

---

## ✨ 核心特性

* 🧭 **统一入口**：根据 `config` 自动推导渲染引擎（Dsh/Codex），支持显式指定 `kind`。
* ⚡ **自适应渲染引擎**：智能路由算法，自动调配 WebGL / Canvas / Video 渲染管线，确保在不同硬件配置下均可获得极佳流畅度。
* 🍎 **多端动态适配策略**：客户端环境自动感知。macOS 原生使用 HEVC-alpha，其他平台无缝降级至 VP9-alpha，避免编解码异常。
* 🎬 **双轨无黑帧**：内置双 `<video>` 交叉淡入缓冲机制，新动画完全加载（`loadeddata`）后才无缝切至前台。
* 🎭 **同构动作池**：内置 14 个同构动作，覆盖 dsh-pet 的 `workStatus` 档位并继承默认循环语义。
* 🎮 **双模控制**：支持声明式（`motion` prop）与命令式（`pet.motion(...)`）灵活混用。
* 🖱️ **智能拖拽分流**：dsh-pet 播放「悬空拽起」动画；Codex 自动转换为「左右行走」模式。
* 💾 **跨会话持久化**：基于 IndexedDB 缓存 Blob 与 Object URL，实现资源跨会话零延迟加载。

> **注意**：网页端的 IndexedDB 可能受 CORS 限制，纯跨域请求场景建议结合代理或关闭缓存。

---

## 📦 安装

```bash
pnpm add dsh-pet-component react

```

> **依赖要求**：`react >= 19` 需作为 Peer Dependency 安装。

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

🔗 [查看在线 Demo](https://dsh-pet-component.vercel.app/)

---

## 💡 进阶指南

### 1. 外部控制与插播

通过 `useControllablePet` hook 下发命令式动作。命令层优先级**高于** `motion` prop。

```tsx
import type { PetRef } from 'dsh-pet-component'
import { Pet, useControllablePet } from 'dsh-pet-component'
import { useRef } from 'react'

export function App() {
  const petRef = useRef<PetRef>(null)
  const pet = useControllablePet(petRef)

  // 命令式控制
  pet.motion({ type: 'thinking', loop: true }) // 强制循环播放
  pet.motion({ type: 'result' })               // 播放一次后自动回落到 idle
  pet.motion({ type: 'waving', replay: true }) // 强制从头重播
  pet.clear()                                  // 清除命令层，恢复 motion prop

  return <Pet ref={petRef} config={config} uri={{ default: '/pets/main/webm' }} />
}

```

### 2. 拖拽交互集成

配合 `@reause/core` 的 `useDraggable` 实现流畅拖拽：

```tsx
import { useDraggable } from '@reause/core'
import { useRef } from 'react'

export function App() {
  const boxRef = useRef<HTMLDivElement>(null)
  const hitboxRef = useRef<HTMLDivElement>(null)

  const { x, y, isDragging } = useDraggable(boxRef, {
    handle: hitboxRef,
    initialValue: { x: 80, y: 80 },
  })

  return (
    <div ref={boxRef} style={{ position: 'fixed', left: x, top: y, pointerEvents: 'none' }}>
      <Pet config={config} dragging={isDragging} hitboxRef={hitboxRef} uri={uri} />
    </div>
  )
}

```

### 3. 气泡与碎碎念 (Bubble & Muttering)

```ts
// 下发与更新气泡
pet.bubble({ id: 'task-1', title: '分析中...', loading: true, motion: 'thinking' })
pet.bubble({ id: 'task-1', title: '完成！', variant: 'success', motion: 'success' }) // 原地更新

pet.bubble.close('task-1') // 关闭指定气泡
pet.bubble.clear()         // 清空气泡

```

```tsx
// 配置自动碎碎念
<Pet
  config={config}
  uri={uri}
  muttering
  mutteringIntervalSec={300}
  onMuttering={(prompt, { meme }) => {
    generateAI(prompt).then(text => pet.muttering(text))
  }}
/>

```

---

## 📚 API 参考

### `<Pet/>` Props 摘要

| 属性 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `config` | `string | PetConfig` | — | 配置对象或 JSON/JSONC 地址 |
| `uri` | `string | { default: string; mac?: string }` | — | 资源请求基地址 |
| `kind` | `'dsh' | 'codex'` | *自动识别* | 强制指定协议类型 |
| `size` | `number` | `462` / `231` | 渲染宽度 (px) |
| `motion` | `MotionInput` | `'idle'` | 声明式动作控制 |
| `dragging` | `boolean` | `false` | 拖拽状态（高优先级） |
| `cache` | `boolean` | `true` | 是否开启 IndexedDB 缓存 |
| `mirrored` | `boolean` | `false` | 是否开启水平镜像翻转 |
| `muttering` | `boolean` | *config* | 是否开启碎碎念 |
| `onMotionChange` | `(motion: string) => void` | — | 实际动作变更回调 |

---

## 🎭 14 个内置同构动作

```text
idle       turn          moving-left   moving-right   waving     thinking 
working    result        waiting       running        review     failed 
success    error

```

* **循环动作**：`idle`, `moving-left`, `moving-right`, `thinking`, `working`, `result`, `waiting`, `running`, `dragging`
* **单次动作**：`turn`, `waving`, `review`, `failed`, `success`, `error`（播完自动回落 `idle`）

---

## 🛠 本地开发

```bash
# 启动 Playground 调试
pnpm install
cd playground && pnpm dev

# 代码质量检查与测试
pnpm run typecheck     # 类型检查
pnpm run lint          # Code Lint
pnpm run test:unit     # Vitest 单元测试（纯逻辑，Node 侧）
pnpm run test:browser  # Vitest 浏览器测试（真 DOM / 真过渡 / 真媒体，跑本机 Chrome）
pnpm run test:coverage # 两套一起跑 + 覆盖率报告（门槛 90%）
pnpm run build         # 产物构建 (tsdown)

```

测试分成两个 Vitest project（见 `vitest.config.ts`）：`unit` 跑 `test/**/*.test.ts`，
`browser` 跑 `test/browser/**/*.test.tsx`。浏览器那套用 `@vitest/browser-playwright` 驱动
本机已装的 Chrome（`channel: 'chrome'`，不下载 Chromium），因此能断言真实的 CSS 过渡、
`getAnimations()` 与媒体播放 —— 气泡进出场这类「观感」缺陷只有在这里才测得出来。

`pnpm run test:coverage` 只统计 `src/**` 的可执行代码（`src/types/**` 是纯类型，不计分），
行 / 分支 / 函数 / 语句四项门槛都是 **90%**，任一项不达标命令即失败。

测试素材：仓库里没有媒体文件、演练场用的是远程 URL，所以 `test/fixtures/pets/*.webm`
是现场生成的（生成路径与 ffmpeg 能力边界见 `test/fixtures/README.md`）。

---

## 📄 开源许可证

[MIT License](https://www.google.com/search?q=./LICENSE) © [Hairyf](https://github.com/hairyf)

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
