// 可验证公平的编排层：承诺哈希计算 + 整场离线复算验证。
// 核心随机算法在 lottery-rng，本模块负责把它和抽奖业务/持久化串起来。
import lotteryConfig from './lottery-config'
import { notifyLotteryChange } from './lottery-store'
import { rngFromState, hashSeed } from './lottery-rng'
import type { DrawLogEntry } from './lottery-types'
import { verifyVerificationPackage } from './fairness-package'
import type { VerificationPackage, VerifyResult } from './fairness-package'
export type { VerifyResult } from './fairness-package'

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
  while (!lotteryConfig.seedCommit) {
    const seed = lotteryConfig.seed
    const commit = await hashSeed(seed)
    // 哈希期间重置了场次时，旧结果不能写回；继续为当前种子计算。
    if (seed !== lotteryConfig.seed) continue
    // 面板 effect 和按钮可能并发等待同一个种子，先完成者负责唯一的一次落盘和通知。
    if (lotteryConfig.seedCommit) return
    lotteryConfig.seedCommit = commit
    lotteryConfig.setLocalStorage()
    notifyLotteryChange()
  }
}

// 只导出业务事实，图片等展示数据不参与验证。数组全部复制，后续抽奖不会改写已生成的包。
export function createVerificationPackage(): VerificationPackage {
  return {
    format: 'lottery-3d-verification',
    version: 1,
    algorithm: 'mulberry32-v1',
    commitmentAlgorithm: lotteryConfig.seedCommit.length === 8 ? 'fnv1a32' : 'sha256',
    seed: lotteryConfig.seed,
    seedCommit: lotteryConfig.seedCommit,
    roster: lotteryConfig.cardList.map(({ id, name }) => ({ id, name })),
    prizes: lotteryConfig.prizeList.map(({ id, name, count, everyTimeGet }) => ({ id, name, count, everyTimeGet })),
    drawLog: lotteryConfig.drawLog.map(entry => ({
      ...entry,
      winnerIds: [...entry.winnerIds],
      winnerNames: [...entry.winnerNames],
      ...(entry.poolIds ? { poolIds: [...entry.poolIds] } : {}),
    })),
    finalState: {
      rngState: lotteryConfig.rngState,
      excludedIds: lotteryConfig.cardListExcluded.map(c => c.id),
      prizes: lotteryConfig.prizeList.map(p => ({
        id: p.id, countRemain: p.countRemain, round: p.round, winnerIds: p.cardListWin.map(c => c.id),
      })),
    },
  }
}

// 完整验证当前局：承诺 + 规则和有序奖池 + 作废/撤销 + 最终结果。
export function verifyCurrent(): Promise<VerifyResult> {
  return verifyVerificationPackage(createVerificationPackage())
}
