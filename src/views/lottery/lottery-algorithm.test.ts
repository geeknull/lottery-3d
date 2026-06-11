import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LotteryConfig } from './lottery-config'
import type { Card, Prize } from './lottery-types'

// lottery-config 是模块级单例（加载时读 localStorage），
// 每个用例用 resetModules + 动态 import 拿到全新状态
async function loadFreshModules() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const { getRandomCard } = await import('./lottery-algorithm')
  return { lotteryConfig, getRandomCard }
}

let lotteryConfig: LotteryConfig
let getRandomCard: (prize: Prize) => Card[]

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {}) // 业务模块加载/抽奖时有调试日志，保持测试输出干净
  ;({ lotteryConfig, getRandomCard } = await loadFreshModules())
})

describe('getRandomCard', () => {
  it('剩余名额充足时抽出 everyTimeGet 个人', () => {
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 5)!
    const selected = getRandomCard(prize)
    expect(selected).toHaveLength(5)
  })

  it('剩余名额不足时只抽出剩余数量', () => {
    const prize = lotteryConfig.prizeList[0]
    prize.countRemain = 2
    prize.everyTimeGet = 10
    const selected = getRandomCard(prize)
    expect(selected).toHaveLength(2)
  })

  it('中奖人从未中奖池移除，连续抽取不会重复中奖', () => {
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    const first = getRandomCard(prize)
    const second = getRandomCard(prize)
    const firstIds = new Set(first.map(c => c.id))
    expect(second.some(c => firstIds.has(c.id))).toBe(false)
    const remainIds = new Set(lotteryConfig.cardListRemainAll.map(c => c.id))
    ;[...first, ...second].forEach(c => expect(remainIds.has(c.id)).toBe(false))
  })

  it('一次抽取内不会重复中奖', () => {
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    const selected = getRandomCard(prize)
    expect(new Set(selected.map(c => c.id)).size).toBe(selected.length)
  })

  it('抽取后更新奖项剩余数量、轮数和中奖名单', () => {
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 5)!
    const countBefore = prize.countRemain
    const roundBefore = prize.round
    const selected = getRandomCard(prize)
    expect(prize.countRemain).toBe(countBefore - selected.length)
    expect(prize.round).toBe(roundBefore + 1)
    expect(prize.cardListWin).toEqual(selected)
  })

  it('全局中奖名单累计且与各奖项名单一致', () => {
    const [p1, p2] = lotteryConfig.prizeList
    getRandomCard(p1)
    getRandomCard(p2)
    expect(lotteryConfig.cardListWinAll).toHaveLength(p1.cardListWin.length + p2.cardListWin.length)
    expect(lotteryConfig.cardListRemainAll).toHaveLength(
      lotteryConfig.cardList.length - lotteryConfig.cardListWinAll.length
    )
  })

  it('抽奖进度写入 localStorage', () => {
    const prize = lotteryConfig.prizeList[0]
    getRandomCard(prize)
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    expect(saved.hash).toBeTruthy()
    expect(saved.cardListWinAll).toHaveLength(prize.cardListWin.length)
  })
})

describe('抽奖进度恢复', () => {
  it('配置未变时重新加载可恢复进度', async () => {
    const prize = lotteryConfig.prizeList[0]
    const selected = getRandomCard(prize)

    // 模拟刷新：只重置模块不清 localStorage
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListWinAll.map(c => c.id)).toEqual(selected.map(c => c.id))
    expect(reloaded.prizeList[0].countRemain).toBe(prize.countRemain)
  })
})
