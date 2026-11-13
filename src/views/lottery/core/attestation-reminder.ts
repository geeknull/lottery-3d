// 本页内是否打开过公证卡。只存在内存里，不进存档：刷新后可能再提醒一次（决策 014 #2）。
let shown = false

export function markAttestationShown(): void {
  shown = true
}

export function wasAttestationShown(): boolean {
  return shown
}

// 仅供测试复位模块状态。
export function resetAttestationReminder(): void {
  shown = false
}
