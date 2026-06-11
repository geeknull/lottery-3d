// 可验证公平的编排层：承诺哈希计算 + 整场离线复算验证。
// 核心随机算法在 lottery-rng，本模块负责把它和抽奖业务/持久化串起来。
import lotteryConfig from './lottery-config'
import { notifyLotteryChange } from './lottery-store'
import { rngFromState, hashSeed } from './lottery-rng'
import type { DrawLogEntry } from './lottery-types'

export interface VerifyResult {
  ok: boolean
  checkedDraws: number // 实际复算了多少轮抽奖
  failedAt: number | null // 失败的 drawLog 下标（null 表示全部通过）
}

// 用种子离线复算整场抽奖：每轮从当时的奖池快照按 rng 重抽，应得到相同中奖名单，
// 且 rng 状态在各轮间连续推进（防止中途换种子）。
export function verifyDrawLog(seed: number, drawLog: DrawLogEntry[]): VerifyResult {
  let expectedState = seed >>> 0
  let checkedDraws = 0

  for (let i = 0; i < drawLog.length; i++) {
    const entry = drawLog[i]
    if (entry.type !== 'draw') {
      continue // 作废/撤销不消耗随机流
    }
    // 状态链必须连续：本轮抽前状态应等于上一轮抽后的状态
    if (entry.rngStateBefore !== expectedState || !entry.poolIds) {
      return { ok: false, checkedDraws, failedAt: i }
    }
    const rng = rngFromState(entry.rngStateBefore)
    const pool = [...entry.poolIds]
    const replayed: string[] = []
    for (let k = 0; k < entry.winnerIds.length && pool.length > 0; k++) {
      const idx = rng.nextInt(0, pool.length - 1)
      replayed.push(pool.splice(idx, 1)[0])
    }
    if (replayed.length !== entry.winnerIds.length || replayed.some((id, j) => id !== entry.winnerIds[j])) {
      return { ok: false, checkedDraws, failedAt: i }
    }
    expectedState = rng.getState()
    checkedDraws++
  }
  return { ok: true, checkedDraws, failedAt: null }
}

// 计算并固定种子承诺哈希（抽奖开始前公布）。已有则保持不变。
export async function ensureSeedCommit(): Promise<void> {
  if (lotteryConfig.seedCommit) {
    return void 0
  }
  lotteryConfig.seedCommit = await hashSeed(lotteryConfig.seed)
  lotteryConfig.setLocalStorage()
  notifyLotteryChange()
}

// 验证当前这一局
export function verifyCurrent(): VerifyResult {
  return verifyDrawLog(lotteryConfig.seed, lotteryConfig.drawLog)
}
