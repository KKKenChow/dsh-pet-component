import type { MotionInput, PetAnimationInfo, PetRef, PetRenderMotion } from 'dsh-pet-component'
import {
  Pet,
  useConfig,
  useControllablePet,
} from 'dsh-pet-component'
import { useCallback, useRef, useState } from 'react'
import {
  MOTION_GROUPS,
  motionLabel,
} from '../constants'
import { useDomAttribute } from '../hooks/use-dom-attribute'
import { usePetDrag } from '../hooks/use-pet-drag'
import { usePlaygroundPrefs } from '../hooks/use-playground-prefs'
import { Slider, Stage, Switch } from './controls'
import { MediaPlayer } from './media-player'

/* -------------------------------------------------------------------------- */
/* 素材与命令清单                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 两种素材 —— **组件只有一个 `<Pet>`**，换素材就换协议：
 * `Pet` 按 `config` / `uri` 自动判定该用 `DshPet`（透明视频）还是 `CodexPet`（雪碧图集）。
 */
const ASSETS = [
  {
    id: 'dsh' as const,
    label: 'dsh-pet 素材',
    hint: 'config.jsonc + assets/webm → 自动判定为 DshPet（逐动作透明视频）',
    config: 'https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/config.jsonc',
    uri: {
      default: 'https://raw.githubusercontent.com/PC2005-cloud/dsh-pet/refs/heads/main/dsh-pet/assets/webm',
      mac: 'https://raw.githubusercontent.com/dsh-tauri-desk/dsh-pet-mov/refs/heads/main/mov',
    },
    ext: { default: 'webm', mac: 'mov' },
  },
  {
    id: 'codex' as const,
    label: 'Codex 素材',
    hint: 'pet.json + spritesheet.webp → 自动判定为 CodexPet（8 列雪碧图集）',
    config: 'https://unpkg.com/@signalight/dsh-codex-pet@0.3.1/assets/nastya/pet.json',
    uri: 'https://unpkg.com/@signalight/dsh-codex-pet@0.3.1/assets/nastya/spritesheet.webp',
  },
]

/** 命令面插播：`pet.motion(...)` 优先于 `motion` prop（一直保持到 prop 变化为止）。 */
const COMMANDS: { label: string, input: MotionInput, code: string }[] = [
  { label: '思考（循环）', input: { type: 'thinking', loop: true }, code: `pet.motion({ type: 'thinking', loop: true })` },
  { label: '干活（循环）', input: { type: 'working', loop: true }, code: `pet.motion({ type: 'working', loop: true })` },
  { label: '整理（循环）', input: { type: 'result', loop: true }, code: `pet.motion({ type: 'result', loop: true })` },
  { label: '等待（循环）', input: { type: 'waiting', loop: true }, code: `pet.motion({ type: 'waiting', loop: true })` },
  { label: '结果（播一次）', input: { type: 'result' }, code: `pet.motion({ type: 'result' })` },
  { label: '完成（播一次）', input: { type: 'success' }, code: `pet.motion({ type: 'success' })` },
  { label: '出错（播一次）', input: { type: 'error' }, code: `pet.motion({ type: 'error' })` },
  { label: '再挥手一次（replay）', input: { type: 'waving', replay: true }, code: `pet.motion({ type: 'waving', replay: true })` },
  { label: '手势态：被抓起', input: { type: 'dragging' }, code: `pet.motion({ type: 'dragging' })` },
]

/**
 * 桌宠组件的唯一演示 —— **只用一个 `<Pet>`**，全部能力都在这一个组件里：
 *
 * | 能力 | 用到的 API |
 * | --- | --- |
 * | 换协议 | 切换 `config` / `uri` 素材，`Pet` 自动判定 `DshPet` / `CodexPet` |
 * | 声明式动作 | `motion` prop（14 个动作墙） |
 * | 命令式动作 | `useControllablePet` → `pet.motion(...)` / `pet.clear()` |
 * | 拖动 | `useDraggable` + `dragging` prop（dsh → 悬空，Codex → 左右行走） |
 * | 走路素材 | `moving-left` / `moving-right`（dsh 取 `moves` 池，与拖动是两套素材） |
 * | 点击回应 | 双击判定 → `pet.motion({ type: 'waving', replay: true })` |
 * | 缓存 | `cache` prop（资源落 IndexedDB，第二次走本地） |
 * | 只读回显 | `onMotionChange` / `onAnimationChange` + `data-look` |
 * | 媒体控制 | 见 `media-player.tsx`（playground 自己的 `useMediaControls`） |
 *
 * 拖动区只有一个：组件内部的 `dsh-pet__hitbox`（`hitboxRef` 指向它）。
 * 外层的 `stage__pet` 只是**被移动的元素**（`pointer-events: none`，没有 grab 光标），
 * 勾上「显示命中框」可以直接看到拖动区到底在哪。
 */
export function PetDemo() {
  // 面板上的可调项：`useLocalStorage` 持久化（跨刷新保留、跨标签页同步）
  const { prefs, update, reset } = usePlaygroundPrefs()
  // 尺寸按素材各存一份：Codex 同样宽度下人物约是 dsh-pet 的两倍，默认减半
  const size = prefs.sizes[prefs.asset]

  const asset = ASSETS.find(entry => entry.id === prefs.asset) ?? ASSETS[0]!

  const stageRef = useRef<HTMLDivElement | null>(null)
  const petRef = useRef<PetRef>(null)
  const pet = useControllablePet(petRef)

  const [current, setCurrent] = useState<PetRenderMotion>('idle')
  const [animation, setAnimation] = useState<PetAnimationInfo | null>(null)
  const [status, setStatus] = useState('等待资源…')
  const [lastCommand, setLastCommand] = useState('—')
  const [clicks, setClicks] = useState(0)

  // 配置回显（与 `Pet` 共用同一份配置缓存，不会重复拉取）
  const { config, loading, error: configError } = useConfig(asset.config)
  // 判定现在跑的是哪套协议：清单里有 `spriteVersionNumber` 就是 Codex；
  // 配置还没到时先按选中的素材预判（`Pet` 内部用的是同一条判据）
  const isCodex = config === null ? prefs.asset === 'codex' : 'spriteVersionNumber' in config

  const manifest = config !== null && 'spriteVersionNumber' in config
    ? {
        name: config.displayName ?? config.id ?? '—',
        version: config.spriteVersionNumber ?? 2,
        path: config.spritesheetPath ?? '—',
      }
    : null
  const pools = config !== null && 'animations' in config
    ? {
        drag: config.animations?.drag?.length ?? 0,
        idle: config.animations?.idle?.length ?? 0,
        clicks: config.animations?.clicks?.length ?? 0,
        categories: config.animations?.categories?.length ?? 0,
        moves: config.animations?.moves?.actions.length ?? 0,
      }
    : null

  // look 格每帧都在变，用 DOM 回显（不把每帧都提成 state 触发重渲染）
  const look = useDomAttribute(stageRef, '.dsh-pet', 'data-look')

  /* --------------------------------- 拖动 ---------------------------------- */

  const runCommand = useCallback((input: MotionInput, label?: string) => {
    pet.motion(input)
    setLastCommand(label ?? JSON.stringify(input))
  }, [pet])

  // 拖动机械部分用库里的 useDraggable；handle 是组件的 hitboxRef（命中框），
  // 阈值 8px / 方向 3px / 双击 500ms 的判定在 usePetDrag 里按参考实现补
  const drag = usePetDrag({
    containerRef: stageRef,
    onDoubleClick: () => {
      setClicks(count => count + 1)
      runCommand({ type: 'waving', replay: true }, `pet.motion({ type: 'waving', replay: true })`)
    },
  })
  const { dragging, direction } = drag
  const motion = direction ? { left: 'moving-left', right: 'moving-right' }[direction] as PetRenderMotion : prefs.motion

  /* -------------------------------- 播放目标 -------------------------------- */

  /* ---------------------------------- 渲染 ---------------------------------- */

  return (
    <section className="demo">
      <header className="demo__head">
        <div className="tabs">
          {ASSETS.map(entry => (
            <button
              key={entry.id}
              type="button"
              className={`tab${prefs.asset === entry.id ? ' is-active' : ''}`}
              title={entry.hint}
              onClick={() => update('asset', entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="demo__hint">{asset.hint}</p>
      </header>

      <div className="demo__body">
        <div className="demo__stage">
          <Stage stageRef={stageRef} dragging={dragging} pressed={drag.pressed} showHitbox={prefs.showHitbox}>
            <div ref={drag.boxRef} className="stage__pet" style={{ left: drag.x, top: drag.y }}>
              <Pet
                ref={petRef}
                config={asset.config}
                uri={asset.uri}
                ext={asset.ext}
                size={size}
                motion={motion}
                dragging={dragging}
                cache={prefs.cache}
                mirrored={prefs.mirrored}
                lookAtPointer={prefs.lookAtPointer}
                hitboxRef={drag.handleRef}
                onHitboxPointerDown={drag.onHitboxPointerDown}
                onHitboxPointerUp={drag.onHitboxPointerUp}
                onHitboxPointerCancel={drag.onHitboxPointerUp}
                onMotionChange={setCurrent}
                onAnimationChange={setAnimation}
                onReady={() => setStatus('就绪')}
                onError={(cause: unknown) => setStatus(`出错：${cause instanceof Error ? cause.message : String(cause)}`)}
              />
            </div>
          </Stage>
          <p className="hint">
            拖动区是组件内部的
            {' '}
            <code>dsh-pet__hitbox</code>
            （宠物身体那一小块，勾上「显示命中框」可以看到），点空白处不起拖。拖动时
            {' '}
            {isCodex ? 'Codex 按方向播左右行走行' : 'dsh-pet 只播 animations.drag 的悬空姿势（走路素材在动作墙里手动触发）'}
            ，单击不播拖动动画，双击播一次点击回应。当前方向：
            <code>{direction ?? '—'}</code>
          </p>

          {/* Codex 素材是整张图集，没有「单条视频」可播 —— 播放器只对 dsh-pet 那条链路有意义 */}
          <MediaPlayer
            src={isCodex ? null : (animation?.src ?? null)}
            emptyHint={isCodex ? 'Codex 素材是整张雪碧图集，没有单条动画视频' : undefined}
          />

          <p className="hint">
            整页只有一个
            {' '}
            <code>&lt;Pet&gt;</code>
            ：换素材就换协议，`DshPet` / `CodexPet` 由它内部按配置选。
            面板上的开关用
            {' '}
            <code>useLocalStorage</code>
            {' '}
            存在 localStorage，跨刷新保留、跨标签页同步；点「重置面板」清掉这条记录。
          </p>
        </div>

        <div className="panel">
          <dl className="readout">
            <div>
              <dt>自动判定渲染器</dt>
              <dd>
                <code>{isCodex ? 'CodexPet' : 'DshPet'}</code>
                <span className="muted">
                  {loading ? '配置加载中，先按素材预判' : 'spriteVersionNumber → CodexPet，否则 DshPet'}
                </span>
              </dd>
            </div>
            <div>
              <dt>生效动作</dt>
              <dd>
                {motionLabel(current)}
                <code>{current}</code>
              </dd>
            </div>
            <div>
              <dt>播放中的动画</dt>
              <dd>
                <code>{animation?.name ?? '—'}</code>
                {animation?.row !== undefined && <code>{`row ${animation.row}`}</code>}
                <span className="muted">{animation === null ? '' : animation.once ? '播一次' : '循环'}</span>
              </dd>
            </div>
            <div>
              <dt>手势态</dt>
              <dd>
                <code>{dragging ? 'dragging' : 'none'}</code>
                <span className="muted">
                  {`位置 ${Math.round(drag.x)}, ${Math.round(drag.y)}`}
                </span>
              </dd>
            </div>
            <div>
              <dt>look 格</dt>
              <dd><code>{isCodex ? (look ?? '—') : '仅 Codex v2'}</code></dd>
            </div>
            <div>
              <dt>最近一条命令</dt>
              <dd><code>{lastCommand}</code></dd>
            </div>
            <div>
              <dt>双击次数</dt>
              <dd>{clicks}</dd>
            </div>
            <div>
              <dt>配置</dt>
              <dd>
                {configError !== null && `出错：${configError.message}`}
                {manifest !== null && (
                  <>
                    <code>{manifest.name}</code>
                    <code>{`spriteVersionNumber ${manifest.version}`}</code>
                  </>
                )}
                {pools !== null && (
                  <>
                    <code>{`drag ${pools.drag}`}</code>
                    <code>{`clicks ${pools.clicks}`}</code>
                    <code>{`moves ${pools.moves}（走路，手动触发）`}</code>
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{status}</dd>
            </div>
          </dl>

          <div className="motion-bar">
            {MOTION_GROUPS.map(group => (
              <div className="motion-bar__group" key={group.title}>
                <span className="motion-bar__title">{group.title}</span>
                <div className="motion-bar__row">
                  {group.motions.map(entry => (
                    <button
                      key={entry}
                      type="button"
                      className={`btn btn--chip${motion === entry && !dragging ? ' is-active' : ''}`}
                      title={`motion：${entry}`}
                      onClick={() => update('motion', entry)}
                    >
                      {motionLabel(entry)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <p className="motion-bar__title">
              命令面 · pet.motion(...)（优先于 motion prop，直到 motion prop 变化）
            </p>
            <div className="actions actions--wrap">
              {COMMANDS.map(command => (
                <button
                  key={command.code}
                  type="button"
                  className="btn"
                  title={command.code}
                  onClick={() => runCommand(command.input, command.code)}
                >
                  {command.label}
                </button>
              ))}
              <button
                type="button"
                className="btn"
                title="pet.clear()：清掉命令面动作，回落到 motion prop"
                onClick={() => {
                  pet.clear()
                  setLastCommand('pet.clear()')
                }}
              >
                pet.clear()
              </button>
            </div>
          </div>

          <div className="controls">
            <Switch
              label="声明层 loop（motion prop 的循环语义）"
              checked={prefs.loop}
              onChange={value => update('loop', value)}
              hint="只影响 motion prop；命令面各自带语义（thinking/working… 循环，success/error… 播一次）"
            />
            <Switch label="IndexedDB 缓存" checked={prefs.cache} onChange={value => update('cache', value)} />
            <Switch label="水平镜像" checked={prefs.mirrored} onChange={value => update('mirrored', value)} />
            <Switch
              label="显示命中框"
              checked={prefs.showHitbox}
              onChange={value => update('showHitbox', value)}
              hint="描出 dsh-pet__hitbox —— 拖动区就是它，宠物盒子的其余部分不响应指针"
            />
            {isCodex && (
              <Switch
                label="鼠标追踪 look（v2 专属）"
                checked={prefs.lookAtPointer}
                onChange={value => update('lookAtPointer', value)}
                hint="仅在 idle 循环时生效；指针进入死区即恢复待机帧"
              />
            )}
            <Slider
              label="尺寸"
              value={size}
              min={80}
              max={520}
              suffix="px"
              onChange={value => update('sizes', { ...prefs.sizes, [(asset as any).uri]: value })}
            />
          </div>

          <div className="actions">
            <button type="button" className="btn" onClick={drag.reset}>复位位置</button>
            <button type="button" className="btn" onClick={reset}>重置面板</button>
          </div>

        </div>
      </div>
    </section>
  )
}
