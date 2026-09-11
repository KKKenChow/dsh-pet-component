import type { ReactNode, RefObject } from 'react'

export interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
}

/** 受控开关。 */
export function Switch({ label, checked, onChange, hint }: SwitchProps) {
  return (
    <label className="switch" title={hint}>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span className="switch__label">{label}</span>
    </label>
  )
}

export interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}

/** 受控滑杆。 */
export function Slider({ label, value, min, max, step = 1, suffix = '', onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider__label">
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export interface StageProps {
  children: ReactNode
  stageRef?: RefObject<HTMLDivElement | null>
  /** 拖拽会话进行中（高亮边框） */
  dragging?: boolean
  /** 命中框按下（底色反馈） */
  pressed?: boolean
  /** 把 `.dsh-pet__hitbox` 描出来：拖动区就是这个元素，不是宠物盒子 */
  showHitbox?: boolean
}

/**
 * 宠物摆放台：相对定位的格线容器。被拖的宠物由 `useDraggable` 的 `x` / `y`
 * 绝对定位在它内部（`stage__pet`），所以拖出边界也不会把布局带跑。
 *
 * `stage__pet` 是**被移动的元素**，不是拖动区：它设了 `pointer-events: none`，
 * 全盒只有命中框（`.dsh-pet__hitbox`，组件内部唯一 `pointer-events: auto` 的元素）
 * 能起拖 —— 与 dsh-pet 的 `.dsh-pet-hit` 同语义。
 */
export function Stage({ children, stageRef, dragging, pressed, showHitbox }: StageProps) {
  return (
    <div
      className={`stage${dragging ? ' is-dragging' : ''}${pressed ? ' is-pressed' : ''}${showHitbox ? ' show-hitbox' : ''}`}
      ref={stageRef}
    >
      {children}
    </div>
  )
}
