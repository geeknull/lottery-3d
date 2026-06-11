import { describe, it, expect, beforeEach, vi } from 'vitest'
import { verifyDrawLog } from './lottery-fairness'
import { hashSeed } from './lottery-rng'
import type { LotteryConfig } from './lottery-config'
import type { Prize } from './lottery-types'

async function loadFresh() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const { getRandomCard } = await import('./lottery-algorithm')
  const fairness = await import('./lottery-fairness')
  return { lotteryConfig, getRandomCard, fairness }
}

let lotteryConfig: LotteryConfig
let getRandomCard: (p: Prize) => unknown
let fairness: typeof import('./lottery-fairness')

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  ;({ lotteryConfig, getRandomCard, fairness } = await loadFresh())
})

describe('verifyDrawLog', () => {
  it('真实抽奖产生的流水可通过验证', () => {
    lotteryConfig.seed = 314159
    lotteryConfig.rngState = 314159
    getRandomCard(lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!)
    getRandomCard(lotteryConfig.prizeList.find(p => p.everyTimeGet === 5)!)

    const result = verifyDrawLog(lotteryConfig.seed, lotteryConfig.drawLog)
    expect(result.ok).toBe(true)
    expect(result.checkedDraws).toBe(2)
    expect(result.failedAt).toBeNull()
  })

  it('篡改某轮中奖名单后验证失败并指出位置', () => {
    lotteryConfig.seed = 271828
    lotteryConfig.rngState = 271828
    getRandomCard(lotteryConfig.prizeList[0])
    getRandomCard(lotteryConfig.prizeList[0])

    // 把第二轮中奖人换成别人
    lotteryConfig.drawLog[1].winnerIds = ['查无此人']
    const result = verifyDrawLog(lotteryConfig.seed, lotteryConfig.drawLog)
    expect(result.ok).toBe(false)
    expect(result.failedAt).toBe(1)
  })

  it('伪造的种子无法通过验证（防止用对结果有利的种子事后顶替）', () => {
    lotteryConfig.seed = 100
    lotteryConfig.rngState = 100
    getRandomCard(lotteryConfig.prizeList[0])

    const result = verifyDrawLog(999, lotteryConfig.drawLog) // 用错误种子验证
    expect(result.ok).toBe(false)
  })

  it('空流水视为通过（还没开抽）', () => {
    expect(verifyDrawLog(lotteryConfig.seed, []).ok).toBe(true)
  })

  it('忽略非抽奖条目（作废/撤销不消耗随机流）', () => {
    lotteryConfig.seed = 42
    lotteryConfig.rngState = 42
    getRandomCard(lotteryConfig.prizeList[0])
    lotteryConfig.drawLog.push({
      type: 'void', at: 0, prizeId: 'x', prizeName: 'x', winnerNames: [], winnerIds: [],
    })
    expect(verifyDrawLog(lotteryConfig.seed, lotteryConfig.drawLog).ok).toBe(true)
  })
})

describe('ensureSeedCommit', () => {
  it('首次调用填充种子承诺哈希并持久化', async () => {
    lotteryConfig.seed = 123
    lotteryConfig.seedCommit = ''
    await fairness.ensureSeedCommit()
    expect(lotteryConfig.seedCommit).toBe(await hashSeed(123))
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    expect(saved.seedCommit).toBe(lotteryConfig.seedCommit)
  })

  it('已有承诺则不重算（保持开始前公布的值不变）', async () => {
    lotteryConfig.seedCommit = 'committed-earlier'
    await fairness.ensureSeedCommit()
    expect(lotteryConfig.seedCommit).toBe('committed-earlier')
  })
})
