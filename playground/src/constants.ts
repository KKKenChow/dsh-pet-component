import type { Motion, PetRenderMotion } from 'dsh-pet-component'

/**
 * 演示用资源地址。
 *
 * 两套协议各取一个真实、公开、带 CORS 的素材源，保证 playground 开箱即用
 * （不需要拉子模块、不需要本地素材）：
 * - **dsh-pet**：`PC2005-cloud/dsh-pet` 仓库里的 `assets/config.jsonc` + `assets/webm`
 *   （VP9-alpha），macOS 走 `dsh-tauri-desk/dsh-pet-mov` 的 HEVC-alpha `.mov`。
 *   这正是 `docs/spec/spec-1.md` 里给的示例。
 * - **Codex Pet**：npm 包 `@signalight/dsh-codex-pet` 里的娜斯佳 v2 图集
 *   （1536×2288 = 8 列 × 11 行，含 16 个 look 格）。
 */

/** 动作中文名（与 dsh-pet 的 `workStatus` 档位语义对齐；含手势态）。 */
export const MOTION_LABELS: Record<PetRenderMotion, string> = {
  'idle': '待机',
  'turn': '转身',
  'moving-left': '左移',
  'moving-right': '右移',
  'waving': '挥手',
  'thinking': '思考',
  'working': '干活',
  'result': '整理',
  'waiting': '等待',
  'running': '运行',
  'review': '复核',
  'failed': '失败',
  'success': '完成',
  'error': '出错',
  'dragging': '拖动',
}

/** 动作标签（未知动作原样回显，回显面板不会因为新档位而空掉）。 */
export function motionLabel(motion: PetRenderMotion | string): string {
  return MOTION_LABELS[motion as PetRenderMotion] ?? motion
}

/** 按语义分组的动作清单（按钮排布用；手势态拖动不在这里，它由指针驱动）。 */
export const MOTION_GROUPS: { title: string, motions: Motion[] }[] = [
  { title: '基础姿态', motions: ['idle', 'turn', 'waving'] },
  { title: '工作状态档（dsh-pet workStatus）', motions: ['thinking', 'working', 'result', 'waiting', 'success', 'error'] },
  { title: '旧粗态 / 方向（moving-* 取走路素材，手动触发）', motions: ['running', 'review', 'failed', 'moving-left', 'moving-right'] },
]
