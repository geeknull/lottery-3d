// 奖项抽完时提醒导出验证文件备份（决策 012 #6）。只判定“该不该提醒”，不碰 DOM 和存档。
// 同一奖项在本页只提醒一次：作废后补抽再次抽完不重复提醒；启动时已经抽完的奖项不提醒。
// “本场不再提醒”按种子记在 sessionStorage：同一标签页刷新后仍生效，换了场次（新种子）重新提醒。
import type { Prize } from './lottery-types'

const DISMISS_KEY = '___lottery_backup_reminder_off___'
const dismissedSeeds = new Set<number>() // sessionStorage 不可用时的退路

export function createBackupReminder(prizes: Pick<Prize, 'id' | 'countRemain'>[]) {
  const reminded = new Set(prizes.filter(prize => prize.countRemain <= 0).map(prize => prize.id))
  return {
    // 返回这次新抽完、还没提醒过的奖项 ID（保持奖项顺序）。
    check(current: Pick<Prize, 'id' | 'countRemain'>[]): string[] {
      const fresh = current.filter(prize => prize.countRemain <= 0 && !reminded.has(prize.id)).map(prize => prize.id)
      fresh.forEach(id => reminded.add(id))
      return fresh
    },
  }
}

export function dismissBackupReminder(seed: number): void {
  dismissedSeeds.add(seed)
  try {
    sessionStorage.setItem(DISMISS_KEY, String(seed))
  } catch {
    // 隐私模式等情况下只在内存里记住
  }
}

export function isBackupReminderDismissed(seed: number): boolean {
  if (dismissedSeeds.has(seed)) return true
  try {
    return sessionStorage.getItem(DISMISS_KEY) === String(seed)
  } catch {
    return false
  }
}

// 仅供测试复位模块状态。
export function resetBackupReminder(): void {
  dismissedSeeds.clear()
}
