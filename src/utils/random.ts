/**
 * 可复现的伪随机源（mulberry32）。
 *
 * 为什么需要：动画池是「等概率抽一个」，但**同一个动作代次（revision）内必须抽到同一段**
 * ——否则 React 的重复渲染 / StrictMode 双调用会让宠物在同一个动作里随机跳换动画。
 * 用 `revision` 当种子，既保证同代次稳定，又保证换动作/强制重播时会重新抽签。
 */
export function createSeededRandom(seed: number): () => number {
  let state = (Math.floor(seed) + 0x6D2B79F5) >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
