import { describe, it, expect, beforeEach, vi } from 'vitest'
import { replaySequence } from './lottery-rng'
import type { LotteryConfig } from './lottery-config'
import type { Card, Prize } from './lottery-types'

// lottery-config 是模块级单例（加载时读 localStorage），
// 每个用例用 resetModules + 动态 import 拿到全新状态
async function loadFreshModules() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const { getRandomCard, voidWinner } = await import('./lottery-algorithm')
  const store = await import('./lottery-store')
  return { lotteryConfig, getRandomCard, voidWinner, store }
}

let lotteryConfig: LotteryConfig
let getRandomCard: (prize: Prize) => Card[]
let voidWinner: (prizeId: string, cardId: string, returnToPool: boolean) => boolean
let store: typeof import('./lottery-store')

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {}) // 业务模块加载/抽奖时有调试日志，保持测试输出干净
  ;({ lotteryConfig, getRandomCard, voidWinner, store } = await loadFreshModules())
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

  it('抽取后通知 UI 数据已变化', () => {
    const listener = vi.fn()
    store.subscribeLottery(listener)
    getRandomCard(lotteryConfig.prizeList[0])
    expect(listener).toHaveBeenCalled()
  })

  it('抽奖进度写入 localStorage', () => {
    const prize = lotteryConfig.prizeList[0]
    getRandomCard(prize)
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    expect(saved.hash).toBeTruthy()
    expect(saved.cardListWinAll).toHaveLength(prize.cardListWin.length)
  })
})

describe('可验证公平：种子化抽奖', () => {
  it('相同种子产生完全相同的中奖结果（可复现）', async () => {
    lotteryConfig.seed = 20260612
    lotteryConfig.rngState = 20260612
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    const first = getRandomCard(prize).map(c => c.id)

    // 全新一局，同样种子，应抽出同样的人
    const fresh = await loadFreshModules()
    fresh.lotteryConfig.seed = 20260612
    fresh.lotteryConfig.rngState = 20260612
    const prize2 = fresh.lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    const second = fresh.getRandomCard(prize2).map(c => c.id)

    expect(second).toEqual(first)
  })

  it('每轮抽取写入 drawLog（抽取前池快照 + 抽中名单 + 抽前 rng 状态）', () => {
    lotteryConfig.seed = 1
    lotteryConfig.rngState = 1
    const prize = lotteryConfig.prizeList[0]
    const picked = getRandomCard(prize)
    expect(lotteryConfig.drawLog).toHaveLength(1)
    const entry = lotteryConfig.drawLog[0]
    expect(entry.type).toBe('draw')
    expect(entry.prizeId).toBe(prize.id)
    expect(entry.winnerIds).toEqual(picked.map(c => c.id))
    expect(entry.rngStateBefore).toBe(1) // 首轮抽前状态 = seed
    expect(entry.poolIds).toEqual(lotteryConfig.cardList.map(c => c.id)) // 首轮池子是全员
  })

  it('drawLog + seed 可离线复算出相同中奖结果', () => {
    lotteryConfig.seed = 555
    lotteryConfig.rngState = 555
    const prize = lotteryConfig.prizeList[0]
    const picked = getRandomCard(prize).map(c => c.id)
    const entry = lotteryConfig.drawLog[0]
    const replayed = replaySequence(entry.rngStateBefore!, entry.poolIds!, entry.winnerIds.length)
    expect(replayed).toEqual(picked)
  })

  it('连续多轮 rng 状态连续推进（每轮 rngStateBefore 接上一轮结果）', () => {
    lotteryConfig.seed = 99
    lotteryConfig.rngState = 99
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    getRandomCard(prize)
    getRandomCard(prize)
    const [a, b] = lotteryConfig.drawLog
    expect(a.rngStateBefore).toBe(99)
    expect(b.rngStateBefore).not.toBe(99) // 第二轮从推进后的状态开始
  })
})

describe('voidWinner 作废中奖', () => {
  it('作废后从奖项中奖名单移除且名额退回', () => {
    const prize = lotteryConfig.prizeList[0]
    const [winner] = getRandomCard(prize)
    const countAfterDraw = prize.countRemain
    const ok = voidWinner(prize.id, winner.id, true)
    expect(ok).toBe(true)
    expect(prize.cardListWin.find(c => c.id === winner.id)).toBeUndefined()
    expect(prize.countRemain).toBe(countAfterDraw + 1)
    expect(lotteryConfig.cardListWinAll.find(c => c.id === winner.id)).toBeUndefined()
  })

  it('退回奖池：作废的人可再次被抽中', () => {
    const prize = lotteryConfig.prizeList[0]
    const [winner] = getRandomCard(prize)
    voidWinner(prize.id, winner.id, true)
    expect(lotteryConfig.cardListRemainAll.some(c => c.id === winner.id)).toBe(true)
  })

  it('不退回奖池：作废的人后续永远不会被抽中', () => {
    const prize = lotteryConfig.prizeList[0]
    const [winner] = getRandomCard(prize)
    voidWinner(prize.id, winner.id, false)
    expect(lotteryConfig.cardListRemainAll.some(c => c.id === winner.id)).toBe(false)
    // 把池子全部抽干验证不会抽到被排除的人
    const bigPrize: Prize = {
      ...prize,
      id: '验证奖',
      countRemain: lotteryConfig.cardListRemainAll.length,
      everyTimeGet: lotteryConfig.cardListRemainAll.length,
      cardListWin: [],
    }
    const all = getRandomCard(bigPrize)
    expect(all.some(c => c.id === winner.id)).toBe(false)
  })

  it('作废状态持久化，刷新后不丢失', async () => {
    const prize = lotteryConfig.prizeList[0]
    const [winner] = getRandomCard(prize)
    voidWinner(prize.id, winner.id, false)

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListExcluded.map(c => c.id)).toEqual([winner.id])
    expect(reloaded.cardListRemainAll.some(c => c.id === winner.id)).toBe(false)
    expect(reloaded.prizeList[0].countRemain).toBe(prize.countRemain)
  })

  it('作废后通知 UI 数据已变化', () => {
    const prize = lotteryConfig.prizeList[0]
    const [winner] = getRandomCard(prize)
    const listener = vi.fn()
    store.subscribeLottery(listener)
    voidWinner(prize.id, winner.id, true)
    expect(listener).toHaveBeenCalled()
  })

  it('奖项或中奖记录不存在时返回 false 且不改数据', () => {
    const prize = lotteryConfig.prizeList[0]
    getRandomCard(prize)
    const before = JSON.stringify(lotteryConfig.cardListWinAll)
    expect(voidWinner('不存在的奖', 'x', true)).toBe(false)
    expect(voidWinner(prize.id, '不存在的人', true)).toBe(false)
    expect(JSON.stringify(lotteryConfig.cardListWinAll)).toBe(before)
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

  it('恢复进度时保留当前配置的奖品图等展示字段', async () => {
    // 先抽一轮存下进度（此时没有奖品图）
    const prize = lotteryConfig.prizeList[0]
    getRandomCard(prize)
    const countAfterDraw = prize.countRemain

    // 用户随后给奖项配了图（标题/奖项数量/名单都没变 → hash 一致）
    const { DEFAULT_HEADER_TITLE, DEFAULT_PRIZES } = await import('./lottery-config')
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1,
      headerTitle: DEFAULT_HEADER_TITLE,
      prizes: DEFAULT_PRIZES.map((p, i) => (i === 0 ? { ...p, img: 'data:image/jpeg;base64,xxx' } : p)),
      roster: lotteryConfig.cardList.map(c => c.name),
    }))

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.prizeList[0].countRemain).toBe(countAfterDraw) // 进度还在
    expect(reloaded.prizeList[0].img).toBe('data:image/jpeg;base64,xxx') // 图也还在
  })
})
