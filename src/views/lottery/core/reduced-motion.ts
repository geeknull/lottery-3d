// 用户是否在系统里开启了「减少动效」。晕动症/前庭敏感用户会开，
// 装饰性动画（彩带、星空穿越等）应尊重此偏好，功能性动画（抽奖旋转）不受影响。
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
