// 本页内是否打开过公证卡、是否已经提醒过。只存在内存里，不进存档：
// 刷新后可能再提醒一次（决策 014 #2）。
let shown = false
let reminded = false

export const START_REMINDER = '提醒：本场还没有展示开抽前公证卡（🛡 公平性 → 公证卡），本轮照常进行'

export function markAttestationShown(): void {
  shown = true
}

export function wasAttestationShown(): boolean {
  return shown
}

// 本页第一次开始抽奖、场次还没有抽奖记录、本页也没打开过公证卡时返回 true。
// 只返回一次：之后无论是否打开过卡片都不再提醒。
export function takeStartReminder(hasDraws: boolean): boolean {
  if (reminded) return false
  reminded = true
  return !shown && !hasDraws
}

// 仅供测试复位模块状态。
export function resetAttestationReminder(): void {
  shown = false
  reminded = false
}
