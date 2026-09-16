# v0.2.0 设计契约：气泡 / 碎碎念（bubble + muttering）

> 状态：**已实施**（A–F 六条于 2026-09-16 逐条采纳；实施记录与对契约的偏差见 §10）
> 上游对位：`source/dsh-pet`（v0.2.10 `4c09729`）、`source/deepseek-harness-desktop`（`a7c61d2`）
> 目标版本：`0.2.0`（minor；新增公开 API，无新依赖）

---

## 1. 目标与范围

### 1.1 本次纳入

| 能力 | 说明 |
| :--- | :--- |
| **`bubble`（展示层）** | 宿主管内容，组件管叠加、原地更新、定时收起、捆绑运行动画 |
| **`muttering`（触发层）** | 组件管节拍与提示词组装，宿主管 LLM 生成，触发逻辑逐条对齐 dsh-pet |
| **配图（memes）** | 碎碎念随机抽 1 张表情包，描述入提示词、图片入气泡 |

### 1.2 明确排除（本轮不做）

- **`pet.chat({ ... })`**：已裁决移出本轮（输入弹窗 + 对话记忆留待后续设计）。
- **会话状态聚合**（`STATUS_PRIORITY` / 合并窗口 / 终态 TTL / 沉淀）：留在宿主的
  `deepseek-harness-desktop/src/pet/utils/bubble-tracker.ts`，本组件只接收已聚合的结果。
- **宿主迁移**：desktop 换掉 HeroUI toast 是它的独立事项，本仓库不依赖、不阻塞。
- 上游纯文档 / CI / Electron helper 改动（见上一轮同步汇报）。

---

## 2. 决策记录

| # | 议题 | 结论 | 依据 |
| :--- | :--- | :--- | :--- |
| D1 | `pet.chat` 语义 | **本轮不做** | 用户裁决（2026-09-16） |
| D2 | `onMuttering` 合约 | **回调是「该要一句了」的通知**；宿主生成后调 `pet.muttering(text)` 推回 | 用户裁决 |
| D3 | 首拍语义 | **严格对齐 dsh-pet**：首拍只记基线、不展示 | 用户裁决 |
| D4 | 配图 memes | **纳入 v0.2.0** | 用户裁决 |

D2 带来的直接后果：组件**不持有 Promise、不做超时竞态**，卸载即注销，与 dsh-pet
「host 生成 / client 展示」的分工同构。

---

## 3. 公开 API 契约

### 3.1 类型（`src/types/bubble.ts`）

```ts
export type PetBubbleVariant = 'default' | 'success' | 'warning' | 'danger'
export type PetBubblePlacement = 'top' | 'bottom'

export interface PetBubbleOptions {
  /** 稳定 key；同 id 再次调用 = 原地更新（不重新淡入、不改创建时间） */
  id?: string
  /** 标题行 */
  title?: ReactNode
  /** 正文（可更新文字） */
  description?: ReactNode
  /** 图标槽；显式给则覆盖内置图标 */
  icon?: ReactNode
  /** 配图 URL（宿主给；碎碎念配图复用同一条链路） */
  image?: string
  /** 加载态：内置 CSS 圆环 spinner */
  loading?: boolean
  /** 语义色；决定内置图标与默认 timeout */
  variant?: PetBubbleVariant
  /** 捆绑运行动画：气泡创建即 `pet.motion(motion)` */
  motion?: MotionInput
  /** 收起时是否 `pet.clear()` 回落（默认 true） */
  restore?: boolean
  /** 自动收起 ms；`0` = 常驻。缺省按 variant（见 3.4） */
  timeout?: number
  /** 相对宠物的方向（默认 'top'） */
  placement?: PetBubblePlacement
}

/** 命令面：可调用 + 具名方法（与 desktop `toast` 的 `toast(key, opts)` / `toast.update` 同形） */
export interface PetBubbleHandle {
  (options: PetBubbleOptions): string
  close: (id?: string) => void
  clear: () => void
}

export type PetMutteringReason = 'baseline' | 'tick' | 'manual'

export interface PetMutteringEvent {
  /** 配置里的宠物 id（`pets[i].id`） */
  petId?: string
  /** baseline = 首拍只记基线；tick = 周期到点；manual = `pet.muttering.request()` */
  reason: PetMutteringReason
  /** 生效周期（秒），宿主可据此自行节流 */
  intervalSec: number
  /** 命中配图时的表情包：`name` = `config.memes` 的键，`desc` = 描述 */
  meme?: { name: string, desc: string }
}

export type PetMutteringHandler = (prompt: string, event: PetMutteringEvent) => void

export interface PetMutteringHandle {
  /** 展示一句：抽 `animations.events.whisper` + 白气泡（默认 10s）+ 可选配图 */
  (text: string, options?: { image?: string, duration?: number, replay?: boolean }): void
  /** 立即向宿主再要一句（`reason: 'manual'`），绕过周期与首拍基线 */
  request: () => void
}
```

> 命名说明：展示用 `pet.muttering(text)`、索要用 `pet.muttering.request()`，避免
> `pet.mutter` 与 `pet.muttering` 两个近义名并存。

### 3.2 `PetRef` 扩展（`src/types/props.ts`）

```ts
export interface PetRef {
  motion: (motion: MotionInput) => void
  clear: () => void
  readonly current: PetRenderMotion
  /** v0.2.0 */
  bubble: PetBubbleHandle
  /** v0.2.0 */
  muttering: PetMutteringHandle
}
```

`useControllablePet(petRef)` 透传同一套命名空间（`pet.bubble({...})` / `pet.muttering(text)`）。

### 3.3 `PetProps` 扩展

```ts
export interface PetProps extends PetCommonProps {
  // …既有…
  /** 自动碎碎念：显式 true/false 优先；`undefined` 回落 `pets[i].whisperEnabled` */
  muttering?: boolean
  /** 覆盖 `config.whisperPrompt`（system 提示词） */
  mutteringPrompt?: string
  /** 覆盖 `config.eventsRefreshSec.whisper`（秒） */
  mutteringIntervalSec?: number
  /** 首拍即索取（关闭 dsh-pet 的「首拍只记基线」行为），默认 false */
  mutteringImmediate?: boolean
  /** 是否抽配图；`undefined` 回落 `config.whisperImageEnabled` */
  mutteringImage?: boolean
  /** 气泡展示时长 ms（默认 10000） */
  mutteringDuration?: number
  /** 该要一句了；宿主生成完调 `pet.muttering(text)` 推回 */
  onMuttering?: PetMutteringHandler
}
```

### 3.4 行为默认值表

| 项 | 默认 | 出处 / 理由 |
| :--- | :--- | :--- |
| `timeout`（`default`） | `0`（常驻） | desktop 创建时 `timeout: 0`，由业务决定收起 |
| `timeout`（`success`） | `3000` | desktop `SUCCESS_TOAST_TIMEOUT = 3000` |
| `timeout`（`danger`） | `4000` | desktop `FAILED_BUBBLE_TIMEOUT = 4000` |
| `timeout`（`warning`） | `2500` | desktop `REVIEW_BUBBLE_TIMEOUT = 2500` |
| 最多同时可见 | `3`，超出关最旧 | desktop `MAX_VISIBLE_TOASTS = 3` + `placementOrder` 淘汰 |
| `placement` | `'top'` | dsh-pet `.dsh-pet-bubble` 在头顶 |
| `restore` | `true` | 气泡收起即回落 `motion` prop |
| 碎碎念气泡时长 | `10000` | dsh-pet `BUBBLE_DURATION_MS = 10 * 1000` |
| `variant` 默认图标 | `success → ✓` / `warning → !` / `danger → ×` / `loading → spinner` | 对齐 desktop `toastContent()` 的 variant 语义 |

**原地更新语义**：同 `id` 再次调用只改内容，保持 `.is-on`（不重新淡入）、不重置
`timeout` 计时（除非显式给 `timeout`）——对齐 desktop `toast.update(key, content)`。

---

## 4. 与参考实现的对位

### 4.1 气泡展示（desktop）

| 参考 | 位置 | 落地 |
| :--- | :--- | :--- |
| toast 内容形状 `{ title, description, isLoading, variant }` | `deepseek-harness-desktop/src/pet/utils/bubble-tracker.ts:317-323` | `PetBubbleOptions` 同名同义，另加 `icon` / `image` / `motion` |
| `isLoading` = 工作中平凡态（running/thinking/working/result） | 同上 `:321` | 由宿主传入 `loading`，组件只负责渲染 |
| variant 映射 waiting/review→warning、failed/error→danger、success→success | 同上 `:309-315` | `PetBubbleVariant` 四值对齐 |
| 创建用 `timeout: 0` + `onClose` 清理；更新走 `toast.update` | 同上 `:541-558` | 同 id 原地更新 + `close/clear` |
| 上限淘汰（只留最新 3 条） | `deepseek-harness-desktop/src/utils/toast.ts:25,88-93` | `MAX_VISIBLE_BUBBLES = 3` |

### 4.2 碎碎念触发（dsh-pet，逐条对齐）

| dsh-pet 行为 | 位置 | 本组件 |
| :--- | :--- | :--- |
| 周期 `eventsRefreshSec.whisper`，钳 `max(1000, sec*1000)`，缺省 `?? 3600` | `source/dsh-pet/dsh-pet/src/client/pet.ts:516` | 同值（`config` → prop → 3600） |
| **首拉只记基线不触发**（`hasBaseline`） | 同上 `:491-496` | 默认严格对齐；`mutteringImmediate` 可关 |
| 抽 `animations.events.whisper` 整池随机 1 槽（避开当前正播） | 同上 `:571-577` | 复用现成 `dshEventPool(animations, 'whisper')` + `pick(pool, current)` |
| 气泡 10s 定时消失，与动画生命周期解耦 | 同上 `:78,595-596` | `mutteringDuration` 默认 10000 |
| 失败静默（`console.warn`，不弹错误气泡） | 同上 `:502-513` | 静默 + `onError?`，不产生气泡 |
| 手动触发绕过节流 | 同上 `:1252` | `pet.muttering.request()`（`reason: 'manual'`） |
| 生成侧归宿主（provider/model/prompt 全在 host） | `source/dsh-pet/dsh-pet/src/host/whisper.ts:1-20` | 组件只交出 `whisperPrompt` |

### 4.3 配图（dsh-pet）

| dsh-pet 行为 | 位置 | 本组件 |
| :--- | :--- | :--- |
| `whisperImageEnabled` 开启时随机抽 1 张（非模型选） | `dsh-pet/src/host/whisper.ts:10-15` | `pickMeme()` 随机抽，注入 `PetMutteringEvent.meme` |
| 抽中后把该图描述注入提示词 | 同上 `userTextWithMeme()` | 组件的职责止于把 `{name, desc}` 交给宿主 |
| 图片在文字上方渲染，宽度 `0.34×` 宠物宽 | `dsh-pet/src/shared/whisper.ts` `MEME_BUBBLE_CSS` | 同系数（见 5.2） |
| URL 拼法 `/pic/memes/<name>.png` | 同上 `memeImageUrl()` | **不假设路径**：`image` 由宿主给完整 URL |

---

## 5. 叠加与样式规格

### 5.1 定位（对齐 `source/dsh-pet/dsh-pet/src/client/bubble.ts:22-36`）

```
.dsh-pet__bubbles   绝对定位容器，纵向堆叠；不参与宿主布局
.dsh-pet__bubble    left:50%; translateX(-50%);
                    bottom:calc(100% - var(--dsh-pet-size)*0.108)
                    min-width:calc(var(--dsh-pet-size)*0.26)
                    max-width:calc(var(--dsh-pet-size)*0.5)
                    padding:calc(var(--dsh-pet-size)*0.022) calc(var(--dsh-pet-size)*0.030)
                    border-radius:calc(var(--dsh-pet-size)*0.035)
                    background:rgba(255,255,255,.92); color:#2b2b2b
                    font-size:calc(var(--dsh-pet-size)*0.0455); line-height:1.6
                    z-index:3; pointer-events:none; white-space:nowrap
                    box-shadow:0 calc(var(--dsh-pet-size)*0.009) calc(var(--dsh-pet-size)*0.035) rgba(0,0,0,.14),0 1px 3px rgba(0,0,0,.08)
                    backdrop-filter:blur(6px); opacity:0; transition:opacity .25s ease
.dsh-pet__bubble.is-on            opacity:1
.dsh-pet__bubble::after           底部小三角：bottom:calc(var(--dsh-pet-size)*-0.017);
                                  border:calc(var(--dsh-pet-size)*0.017) solid transparent;
                                  border-top-color:rgba(255,255,255,.92); border-bottom:none
.dsh-pet__bubble--muttering       字号 0.034、min-width 0.10、white-space:normal、overflow-wrap:anywhere
.dsh-pet__bubble--has-image       min-width:0（贴合图片宽度）
```

- `--dsh-pet-size` 由渲染器（`DshPet` / `CodexPet`）在根节点写入实际宽度 px —— 宿主缩放宠物时气泡等比跟随。
- **字体不打包**（沿用「观感交宿主」既有约定）：只给 dsh-pet 同款 fallback 栈
  （`'ShangshouSoftCandy','Yuanti SC','YouYuan','幼圆','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif`），宿主可 `className` 覆盖。
- **不 portal**（与 dsh-pet 同策略）；宿主 `overflow:hidden` 会被裁 → README 标注 + 预留 `bubblePortal`（后续）。
- `prefers-reduced-motion: reduce` 下取消 `opacity` 过渡（与 `.dsh-pet__video` 的既有处理一致）。

### 5.2 内部结构（气泡条目）

```
[图片 image]          宽度 calc(var(--dsh-pet-size)*0.34)、圆角 *0.026、margin 0 auto *0.017、object-fit cover
[图标 icon | spinner] + [标题 title]        标题 0.035、色 rgba(43,43,43,.6)
[正文 description]                          允许换行
```

---

## 6. 内部架构

### 6.1 关键改造：公开句柄的组合

现状 `usePetMotion` 内部用 `useImperativeHandle(ref, …)` **单独**写入 ref；v0.2.0 要在同一个
ref 上再挂 `bubble` / `muttering` 两个命名空间，两处写同一个 ref 会互相覆盖。改法：

- `DshPet` / `CodexPet` 继续把 `usePetMotion(ref)` 写到**内部 motion ref**；
- `Pet` 层用一次 `useImperativeHandle` 组合公开句柄：
  `motion/clear/current` 代理到内部 motion ref，`bubble` / `muttering` 由 `Pet` 自己实现；
- `Pet` 把气泡层通过新增的 `overlay` 槽渲染进渲染器根节点（`.dsh-pet` 内），保证锚点正确。

### 6.2 文件清单

**新增**

| 路径 | 内容 |
| :--- | :--- |
| `src/types/bubble.ts` | 3.1 的全部类型 + `PetBubbleVariant` / `PetMutteringReason` |
| `src/utils/bubble.ts` | 纯逻辑：`resolveBubbleTimeout(variant, timeout)`、`bubbleUpdateKey`、`clampBubbles(list, max)` |
| `src/hooks/use-pet-bubbles.ts` | `createBubbleQueue()`（React 无关、可单测）+ 薄 hook |
| `src/hooks/use-muttering.ts` | 节拍 + 首拍基线 + 抽池 + 展示 |
| `src/components/bubble-layer.tsx` | 气泡栈（`PetBubbleItem`：图片 → icon/标题 → 正文） |
| `test/bubble-queue.test.ts`、`test/muttering.test.ts`、`test/meme.test.ts` | 见 §7 |
| `docs/spec/spec-2.md` | 本文档 |
| `docs/sync/2026-09-16.md` | 回填上一轮上游评估结论（含 3 项待裁决） |

**改动**

| 路径 | 改动 |
| :--- | :--- |
| `src/config/index.ts` | `+ resolveMutteringPlan()` / `resolveMutteringPrompt()` / `resolveMutteringInterval()` / `isMutteringEnabled()` / `pickMeme()` |
| `src/hooks/use-pet-motion.ts` | ref 写入改为内部 motion ref（见 6.1） |
| `src/components/pet.tsx` | 组合公开句柄；装配 bubble queue + muttering；`overlay` 槽 |
| `src/components/dsh-pet.tsx` / `codex-pet.tsx` | 根节点写 `--dsh-pet-size`；渲染 `overlay` |
| `src/types/props.ts` | `PetRef` 扩两命名空间；`PetProps` 加 6 个 muttering props |
| `src/types/config.ts` | `DshPetConfig` 补 `whisperImageEnabled` / `chatImageEnabled` / `memes`（配图已纳入，不再是纯类型冗余） |
| `src/hooks/use-controllable-pet.ts` | 透传 `bubble` / `muttering` |
| `src/styles.ts` | §5.1 的全部样式 |
| `src/index.ts` | 导出新类型 |
| `README.md` | 新增「气泡 / 碎碎念」章节 |
| `playground/src/components/demo.tsx`、`playground/src/App.css` | 演示（内置假生成器，离线可跑） |
| `package.json` | 版本 → `0.2.0` |

**无新依赖**：spinner、尾巴、内置图标全部用 CSS + 现有 `css-render`。

---

## 7. 测试计划

| 文件 | 用例 |
| :--- | :--- |
| `test/bubble-queue.test.ts` | 创建 / 同 id 原地更新（不新增条目、不改创建时间、不重置计时）/ `close` / `clear` / 上限淘汰（第 4 条挤掉最旧）/ timeout 默认值表 / `motion` 捆绑（`restore` 时 `clear`） |
| `test/muttering.test.ts` | 周期钳制（`0.5 → 1000ms`、缺省 → `3600`）/ 首拍 `baseline` 不展示 / 第二拍展示 / `events.whisper` 空池静默 / 避开当前正播动画 / 10s 收起 / 失败静默 |
| `test/meme.test.ts` | `pickMeme` 空池 / 单条 / 注入随机源 / `whisperImageEnabled` 门控 / `mutteringImage` 覆盖 |
| `test/config.test.ts`（扩展） | `resolveMutteringPlan` 优先级：prop > `pets[i]` > `config` > 默认 |
| `test/api-snapshot.test.ts` + `test/index.snapshot.d.ts` | **重新生成**（新增公开导出） |

---

## 8. 分期与验证

| 阶段 | 内容 | 交付 |
| :--- | :--- | :--- |
| **P0-1** | `bubble` 展示层：句柄组合 + 队列 + 叠加 + 样式 + 捆绑动画 | 可独立验收的底座 + `bubble-queue.test.ts` |
| **P0-2** | `muttering` 触发层：节拍 / 首拍基线 / `pet.muttering` / `request()` / `events.whisper` 抽池 / 10s / 静默 | `muttering.test.ts` |
| **P1** | 配图 memes：类型 + 随机抽 + 载荷 + 气泡图片渲染 | `meme.test.ts` |
| **后续** | `pet.chat`、声明式 `bubbles={[...]}`、`bubblePortal`、desktop 迁移 | 另立 spec |

每阶段一个 PR，PR 描述关联本文档章节。验证命令：

```bash
pnpm lint && pnpm typecheck && pnpm test   # test 脚本本身先跑 tsdown build
pnpm dev:playground                        # 手动验收：叠加 / 更新 / 加载态 / 图片 / 10s 收起
```

---

## 9. 未决与待办

1. **上一轮上游同步的 3 项裁决仍未回填**（`source/dsh-pet` 2136e5d→4c09729 评估结论：建议采纳 0 / 不采纳 21 / 待定 1）：① `whisperImageEnabled`/`chatImageEnabled`/`memes` 是否补类型（**本次因配图纳入而自动成立**）；② gitlink 是否推进到 `4c09729`；③ 记录落在 `docs/sync/2026-09-11.md` 还是新建 `2026-09-16.md`。
2. `pet.chat` 的语义（输入弹窗 / 多轮会话气泡 / 纯命令式）待定后再开 spec。
3. 声明式 `bubbles={[...]}` 与 `motion` prop 的接管语义（谁优先）尚未定，默认先只做命令式。

---

## 10. 实施记录（2026-09-16）

已按 A–F 六条采纳落地，验证：`pnpm lint`（0 error）、`pnpm typecheck`（绿）、
`pnpm run build`（tsdown + publint 通过）、`npx vitest run`（**103 passed**）。

### 10.1 对契约的偏差（3 处）

1. **气泡层不再走渲染器的 overlay 槽**。用户纠正：「我们不需要两个 `*-pet` 都实现气泡，
   向外暴露的只有 `Pet` 组件」。因此 `DshPet` / `CodexPet`（含 `CodexPetProps`）**完全不涉及气泡**，
   `PetCommonProps` 也没有 `overlay`；改为 `Pet` 自套一层 `.dsh-pet-shell`
   （`position: relative; display: inline-block`，不改变宿主布局）承载「渲染器 + 气泡层」。
   `--dsh-pet-size` 随之改由 `Pet` 用 reause 的 `useElementSize` **实测**宽度写入（比按配置推算更准：
   宿主的 `size` / 配置 / CSS 覆盖最终都落在同一个基准上）。
   唯一新增到渲染器上的东西是 `DshPetProps.adHocAnimation`（`@internal`）：碎碎念取的是
   `animations.events.whisper` 整池里的**动画名**，不是 14 个动作之一，走不了 `resolveDshAnimation`
   的解析链，所以复用与空闲掷骰同一条播放通道 —— 这是「按动画名插播」的渲染器能力，不是气泡逻辑。
2. **新增 `PetBubbleOptions.kind`（`@internal`）**：`'bubble' | 'muttering'`。碎碎念文本气泡需要
   小字号 + 允许换行 + 宽度自适应，而常规状态气泡是单行的，所以由形态决定样式类
   （`pet.muttering(text)` 内部传 `'muttering'`，宿主一般不需要传）。
3. **淡入用一次性 keyframes，不是 `.is-on` + transition**：组件按需挂载/卸载气泡，没有常驻节点
   可以切 class；keyframes 时长与 dsh-pet 的 `opacity .25s` 一致。代价是**淡出没有动画**（直接消失），
   已记入 §9 的后续项。

### 10.2 其余落地细节

* **公开句柄组合**：`usePetMotion` 仍然只写 `motion` / `clear` / `current`（内部用一次文档化断言），
  公开的 `PetRef`（= 动作 + `bubble` + `muttering`）由 `Pet` 用一处 `useImperativeHandle` 交出；
  `useControllablePet` 转发三个命名空间，组件未挂载时全部是安全空操作。
* **`pickWhisperAnimation` 与 hook 的关系**：`pickWhisperAnimation(animations, previous?, random?)`
  保留在 `src/config/index.ts` 作为协议级抽取器（单测覆盖「避开上一段 / 池空返回 undefined」）；
  渲染路径由 `Pet` 用 `dshEventPool(animations, 'whisper')` 摊平后把池交给 `useMuttering`，
  控制器内部走 `pick(pool, previous, random)`（纯逻辑、可注入随机源）。
* **测试文件**：`test/bubble-queue.test.ts`（时限表 / 原地更新 / 计时不被更新重置 / 上限淘汰 /
  `dispose`）、`test/muttering.test.ts`（`resolveMutteringPlan` 回落链 + 触发状态机：首拍基线、
  `manual`、空池回落、配图载荷、静默失败）、`test/meme.test.ts`（`pickMeme` / `pickWhisperAnimation`）。
  原计划的「扩展 `test/config.test.ts`」改成独立文件，避免改动那个 566 行的既有文件。
* **公开 API 快照**已重新生成：`test/__snapshots__/tsnapi/dsh-pet-component/index.snapshot.d.ts`
  （+90 行，纯新增；`0.1.1` → `0.2.0` minor）。
* **文档与演示**：README 新增「气泡与碎碎念」章节（含选项表、首拍基线语义、配图分工）并补齐
  `<Pet />` Props 与 `useControllablePet` 表格；playground 的同一个 `<Pet>` 上加了两组演示
  （气泡：加载态 / 原地更新 / 警告色 / 三条叠加 / clear；碎碎念：直接推一句 / 立即要一句 /
  自动 15s 一拍 + 配图开关），生成侧用本地假句子，图片走 dsh-pet 仓库真实的 `assets/memes`。
* **本轮顺带回填**：上一轮上游评估结论写入 `docs/sync/2026-09-16.md`（`docs/sync/2026-09-11.md`
  保持空 stub），其中「`memes` / `whisperImageEnabled` 补进 `DshPetConfig`」随配图落地自动成立；
  **`source/dsh-pet` gitlink 是否从 `2136e5d` 推进到 `4c09729` 仍等裁决**。

---

## 11. 与 deepseek-harness-desktop 的观感对齐（复审 5 项）

用户按实际观感提了 5 条，逐条对着 desktop 的 toast 源码改（HeroUI `components/toast/*`
+ `@heroui/styles/dist/components/toast.css` + `toast/constants.js`）：

1. **字号 / 裁剪 / 圆角与 toast 一致**：标题与正文统一 `14px / 20px`（标题 `font-weight: 500`）；
   正文 `line-clamp-2` 两行截断（对应 desktop 的 `Toast.Description className="line-clamp-2"`）
   + 内容列 `overflow: hidden`；圆角 `min(32px, var(--radius-3xl, 1.5rem))` = 24px；内边距
   `12px 16px`、图标与内容间距 6px。
   **气泡不再按宠物宽度等比缩放** —— desktop 的桌宠气泡本来就是固定尺寸的 toast（它的窗口
   靠 `PET_BUBBLE_MIN_WIDTH = 420` 撑开以保证可读），所以这里改用固定宽度
   `min(460px, calc(100vw - 2rem))`（HeroUI `--toast-width` 默认 460），`--dsh-pet-size`
   只再决定「贴在宠物的哪个高度」。
2. **堆叠与 toast 一致**：逐值照搬 `toast.js` + `constants.js` —— 最新一条在最前（完整尺寸），
   更旧的按 `index` 做 `scale(1 - 0.05·index)` 与 `12px·index` 的位移（方向为**背离宠物**），
   `z-index = count - index`；非最前那条高度取最前那条 + `overflow: hidden`，所以只从背后露出
   一条边。淡入与尾巴只由最前那条承担。
3. **默认图标与 toast 一致**：逐值复制 HeroUI `InfoIcon` / `SuccessIcon` / `WarningIcon` /
   `DangerIcon`（16×16 视口、`fill="currentColor"`、`evenodd`）；加载态用 HeroUI `Spinner` 的
   两段圆弧（原实现走 linearGradient，这里用 `fillOpacity` 静态近似，16px 旋转下观感一致）；
   语义色只染**标题与图标**（`--success-soft-foreground` 等，缺失时回落 `--success` / 硬编码值），
   撤掉之前那个自画的色块圆圈。
4. **原地更新为完成态时动画没换、气泡不消失**（两个真 bug，已修）：
   - 动画：队列原先只在**创建**时回调，`motion` 换了不重发。新增 `onUpdate` 回调 +
     `resolveBubbleMotion()`（用 `motionInputKey` 比较，避免宿主每次传新对象字面量都重播）。
   - 气泡：`updateBubble` 原先「没显式给 `timeout` 就沿用旧时长」，于是 default（常驻）→
     success 永远挂着。现在**语义色变化**会按新语义色的默认时长重算，队列在时长变化时重排计时；
     「只换文字」仍然不重置计时。
5. **加载态气泡期间碎碎念禁用**：`<Pet>` 用 `bubbles.some(b => b.loading)` 把 `suspended` 传给
   `useMuttering`；控制器挂起期间 `tick` / `request` / `show` 全部 no-op，且**不消费「首拍基线」**
   （加载态一结束，第一拍仍是 baseline）。`suspended` 走 ref 不进 `useMemo` 依赖，所以加载态
   来去不会重建控制器、不会白等一个周期。

测试补齐：`test/bubble-queue.test.ts`（`onUpdate` 回调、语义色换档的时长重算、`resolveBubbleMotion`
的等价性比较）、`test/muttering.test.ts`（挂起期间三个入口全静默且首拍基线不被消费）。

---

## 12. 二轮观感修复（同日，复审 4 项）

1. **加载态图标与 desktop 一致**：改用 HeroUI `Spinner` 的完整实现（`spinner/spinner.js` 的
   `SpinnerPrimitive`）—— 两段圆弧 + 两个 linearGradient（id 由 `useId` 派生，避免同页多实例撞车）、
   `size-4`（16px）+ 旋转。上一版用 `fillOpacity` 静态近似渐变，观感确实有差。
2. **图标改为直接从 `@gravity-ui/icons` 取**：新增运行时依赖 `@gravity-ui/icons`（走 catalog，
   实装 2.22.0）。`default` / `success` / `warning` / `danger` 分别是
   `CircleInfo` / `CircleCheck` / `TriangleExclamation` / `CircleExclamation` ——
   与 HeroUI toast 的默认图标同源，也是 desktop 全项目在用的那一批（`src/components/*.tsx`）；
   不再手抄 SVG 路径。
3. **去掉小尖角 + 层叠方向修正**：气泡不再画尾巴（desktop 的 toast 是纯圆角矩形）；层叠方向
   改回 HeroUI 的语义（`toast.js`：`translateY = (isBottom ? -1 : 1) * index * gap`）——
   头顶那摞**往下**叠、脚下那摞往上叠。上一版按「背离宠物」实现成了向上，方向反了。
4. **整体尺寸按宠物缩到合身**：toast 的度量（14px 正文 / 12·16px 内边距 / 24px 圆角 / 6px 间距 /
   460px 宽）是按 462px 画布设计的，固定照搬比宠物大一圈。现在统一走 `scaled(ratio, min, max)`
   —— 以 `--dsh-pet-size`（宠物实测宽度）为基准等比缩放并夹在可读区间：正文与标题
   `clamp(11px, 3.03%, 14px)`、内边距 `clamp(6px, 2.6%, 12px)` / `clamp(8px, 3.46%, 16px)`、
   圆角 `min(24px, 5.2%)`、图标 `clamp(12px, 3.46%, 16px)`、气泡宽 `min(92%, 100vw - 2rem)`、
   配图 `min(26%, 120px)`。层叠间距同样是 `clamp(6px, 2.6%, 12px)`，位移写成行内
   `calc(clamp(...) * index)`，所以跟着宠物一起缩放。

---

## 13. 三轮修复：气泡与动画解耦（同日，3 个现象 + 1 个需求）

1. **现象一「成功动画播不完整」**：根因是气泡超时收起时会 `clear()` 掉刚下发的动作
   （加载态更新为完成 → 3s 后气泡自动收起 → 动作被掐回 idle）。改为与 desktop 同思路的
   **生命周期解耦**：`restore` 缺省 `false`，气泡收起不动动作，让动画自己播完再回落
   （对应 desktop 的 `TERMINAL_PULSE_TTL = 10s`：toast 3s 消失，终结动作还留 10s）。
2. **现象二「另外两条消失后动画变待机」**：根因同上（关掉**没带动画**的那条气泡也会
   `clear()` 当前动作）。现在收起时按「动作主人」规则交还：
   - 当前动作不是这条气泡下发的 → 什么都不做；
   - 是它下发的 → 交还给队列里**最新的那条带 `motion` 的气泡**（`newestMotionBubble()`，
     跳过正在收起的那条）；
   - 没有别的气泡接手时，`restore: true` 才会真的 `clear()`。

   于是「三条叠加」里 B/C 相继收起后，动作会交还给仍在显示的加载态气泡（不再是待机）。
3. **现象三「碎碎念应该用 title 且不要图标」**：`pet.muttering(text)` 现在把文字写进 `title`
   （说话语气，不是 muted 的正文字号/颜色），并且 `kind: 'muttering'` 的气泡**不渲染图标槽**
   （`BubbleIndicator` 直接返回 `null`）—— 对齐 dsh-pet 的白气泡观感。
4. **演示补齐**：playground 新增「更新为警告」（加载态 → `warning` 语义色 + `waiting` 动作）与
   「加载态文字更新」（保持 loading 只换文字）；「警告气泡 / 三条叠加」不再传文字图标，改为展示
   `@gravity-ui/icons` 的默认图标；三条叠加里的加载态给 8s 超时，栈会自己排空。

---

## 14. 四轮修复：抢占 / 循环动作收尾 / 状态压过闲聊（同日，3 个 bug）

1. **Bug 1「正在播动画时触发加载态气泡，动画没有立即切换」**：渲染器把「一次插播」（空闲掷骰的
   风味动作、碎碎念的 whisper 动画）整段当作播放目标，而插播优先级高于动作解析结果，于是状态动作
   要等插播播完才接手。现在 `DshPet` 监听 `state.revision`（每次换动作都会推进），一变化就丢掉
   正在播的插播 —— 状态优先、插播让位。插播自身（`setAdHoc` / 外部 `adHocAnimation`）不推进
   revision，所以不会误清自己。
2. **Bug 2「三条叠加最后剩加载态，气泡消失后一直循环思考」**：上一轮为了让一次性的成功动画播完，
   把 `restore` 缺省改成了「不动动作」—— 但 `thinking` / `working` / `waiting` 这类**循环动作不会
   自己结束**，最后一条气泡收起后就一直循环。现在收尾按语义区分：`restore: true` 一律清；缺省只在
   **循环动作**上 `clear()`（`isLoopingBubbleMotion()`），一次性动作仍然让它播完再回落。
3. **Bug 3「先碎碎念再触发气泡，碎碎念 toast 不消失、叠在后面」**：气泡层不知道谁更重要，碎碎念
   只能等自己的 10s。现在 `Pet` 在**非碎碎念**气泡创建/更新时立即 `close()` 掉碎碎念那条（固定
   id），状态气泡不会再和闲聊叠在一起；碎碎念的动画仍会自然播完。

---

## 15. 架构纠正：动作改成**声明式聚合**（对齐参考实现，替换 §13/§14 的一串补丁）

起因：用户指出「deepseek-harness-desktop 的气泡没这么多问题」。读完参考实现后确认，根因是我把
气泡动作走了**命令面**，而参考实现是声明式的：

```tsx
// source/deepseek-harness-desktop/src/pet/app.tsx:55-57,71
const motion = dragging ? (direction === undefined ? undefined : `moving-${direction}`) : bubble.motion
<Pet motion={motion} dragging={dragging} … />
```

`bubble.motion` 就是 `bubble-tracker.ts` 里多会话聚合出的档位（`statusOf` + `STATUS_PRIORITY`）。
动作是**从状态推导**出来的，所以「谁拥有动作」「收起时要不要 clear」「循环动作会不会一直播」
这些问题在结构上就不存在。

§13/§14 里的补丁（`restore` 缺省 false、motionOwnerRef 动作主人、newestMotionBubble 交还、
isLoopingBubbleMotion 主动 clear、监听 revision 抢占插播）全部是为了绕开「命令面会被 `motion`
prop 变化清掉」这个结构错误 —— 现已整段删除。

### 15.1 本仓库的新结构

```tsx
// src/components/pet.tsx
const bubbleMotion = aggregateBubbleMotion(bubbles)   // 优先级表 = 参考实现的 STATUS_PRIORITY
const effectiveMotion = bubbleMotion ?? motion        // 声明式，交给渲染器的 motion prop
```

- `aggregateBubbleMotion()`（`src/utils/bubble.ts`）与 `bubble-tracker.ts` 的 `statusOf` 同表同规则
  （`waiting 60 > error 50 > failed 45 > review 40 > working 30 > result 25 > thinking 20 >
  running 12 > success 10 > idle 0`，`>` 比较所以同档取先入队的那条）。多会话并发时宿主不必自己
  算优先级，每条气泡带上自己的档位即可。
- 动作随气泡状态自动出现 / 自动回落，**没有 `clear` 这回事**。`restore` 选项因此删除
  （v0.2.0 未发布，属未发布 API 的调整；`tsnapi` 会把它记为 breaking，用
  `TSNAPI_ALLOW_BREAKING=1 npx vitest run -u` 更新快照）。
- `Pet` 里不再有 `motionOwnerRef` / `bubblesRef` / `onClose` 动作逻辑。

### 15.2 顺带对齐参考实现的三处语义

1. **超时只给终态档**：`BUBBLE_DEFAULT_TIMEOUT` 改为 `{ default: 0, success: 3000, warning: 0,
   danger: 4000 }` —— 对应 `scheduleHide` 只给 `failed/error`(4000)、`review`(2500)、
   `success`(3000) 排计时器；`waiting`（warning）与工作档位都是常驻。于是「更新为警告」不会莫名
   开始倒计时，而「更新为完成」仍会 3s 后收起（转入终态档才排计时器）。`review` 语义请显式传
   `timeout: 2500`。
2. **插播只在纯待机时播**（`DshPet` 的 `idleForFlavor`）：会话状态优先于风味动作，状态动作不会被
   插播挡住；碎碎念清掉状态气泡后正好回到待机，插播动画此时才有位置播 —— 不再需要「监听 revision
   抢占插播」那条 effect。
3. **碎碎念门控只在自动周期**：`isSuspended` 只挡 `tick()`，手动 `pet.muttering(...)` /
   `request()` 永远可用（对齐 dsh-pet 注释「`whisperEnabled` 只关自动周期轮询，手动永远可用」，
   `client/pet.ts:1252-1259`）；手动/自动碎碎念展示前先 `clear()` 掉状态气泡（说话优先于状态）。
   周期默认对齐上游配置 `eventsRefreshSec.whisper = 300`（5 分钟），首拍仍只记基线。

### 15.3 Codex look 的作用半径

`CodexPet` 的 look 之前**没有上界**：指针停在屏幕任何角落都会把宠物钉在一个 look 格上，
`pointermove` 之后再也不会回到待机动画。现在加了作用半径（`lookRadius` prop，缺省
`max(宽, 高) * CODEX_LOOK_RADIUS_FACTOR = 1.25`），出界即 `setLookIndex(undefined)` 回待机；
另外 `pointerout`（无 `relatedTarget`，即离开整窗）与窗口 `blur` 也会清掉 look，拖动期间不参与 look。
