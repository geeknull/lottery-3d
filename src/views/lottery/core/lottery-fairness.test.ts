import { describe, it, expect, beforeEach, vi } from 'vitest'
import { verifyDrawLog } from './lottery-fairness'
import { hashSeed } from './lottery-rng'
import { verifyVerificationPackage } from './fairness-package'
import type { LotteryConfig } from './lottery-config'
import type { Card, Prize } from './lottery-types'

async function loadFresh() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const algorithm = await import('./lottery-algorithm')
  const { getRandomCard } = algorithm
  const fairness = await import('./lottery-fairness')
  return { lotteryConfig, getRandomCard, fairness, algorithm }
}

let lotteryConfig: LotteryConfig
let getRandomCard: (p: Prize) => Card[]
let fairness: typeof import('./lottery-fairness')
let algorithm: typeof import('./lottery-algorithm')

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.unstubAllGlobals()
  ;({ lotteryConfig, getRandomCard, fairness, algorithm } = await loadFresh())
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

  it('同一种子的并发哈希逆序完成时只持久化和通知一次', async () => {
    const rng = await import('./lottery-rng')
    const store = await import('./lottery-store')
    const older = Promise.withResolvers<string>()
    const newer = Promise.withResolvers<string>()
    const hash = vi.spyOn(rng, 'hashSeed').mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const saved = vi.spyOn(lotteryConfig, 'setLocalStorage')
    const version = store.getLotteryVersion()
    const first = fairness.ensureSeedCommit()
    const second = fairness.ensureSeedCommit()
    newer.resolve('same-seed-commit')
    await second
    older.resolve('same-seed-commit')
    await first
    expect(lotteryConfig.seedCommit).toBe('same-seed-commit')
    expect(saved).toHaveBeenCalledTimes(1)
    expect(store.getLotteryVersion()).toBe(version + 1)
    hash.mockRestore()
  })

  it('哈希过程中种子变化时丢弃旧承诺并为当前种子重算', async () => {
    const rng = await import('./lottery-rng')
    const oldHash = Promise.withResolvers<string>()
    const hash = vi.spyOn(rng, 'hashSeed').mockReturnValueOnce(oldHash.promise).mockResolvedValue('current-seed-commit')
    lotteryConfig.seed = 7
    const pending = fairness.ensureSeedCommit()
    lotteryConfig.seed = 8
    oldHash.resolve('old-seed-commit')
    await pending
    expect(lotteryConfig.seedCommit).toBe('current-seed-commit')
    expect(hash.mock.calls.map(([seed]) => seed)).toEqual([7, 8])
    hash.mockRestore()
  })
})

describe('当前场次的承诺校验', () => {
  it('随机流正确但承诺被替换时拒绝通过', async () => {
    lotteryConfig.seed = 7
    lotteryConfig.rngState = 7
    getRandomCard(lotteryConfig.prizeList[0])
    lotteryConfig.seedCommit = await hashSeed(8)
    expect((await fairness.verifyCurrent()).ok).toBe(false)
  })
})

describe('完整验证文件', () => {
  async function useWebCrypto() {
    const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>('node:crypto')
    vi.stubGlobal('crypto', webcrypto)
  }

  async function drawPackage() {
    lotteryConfig.seed = 42
    lotteryConfig.rngState = 42
    await fairness.ensureSeedCommit()
    getRandomCard(lotteryConfig.prizeList[0])
    return fairness.createVerificationPackage()
  }

  it('导出算法版本、有序名单、规则、全部操作与最终结果，可脱离当前场次验证', async () => {
    const pkg = await drawPackage()
    expect(pkg.algorithm).toBe('mulberry32-v1')
    expect(pkg.roster.map(p => p.id)).toEqual(lotteryConfig.cardList.map(c => c.id))
    expect(pkg.prizes[0]).toEqual({ id: '特等奖', name: '特等奖', count: 5, everyTimeGet: 1 })
    expect(pkg.drawLog[0].poolIds).toEqual(pkg.roster.map(c => c.id))
    expect(pkg.drawLog[0].winnerIds).toHaveLength(1)
    const imported: unknown = JSON.parse(JSON.stringify(pkg))
    lotteryConfig.seed = 999
    lotteryConfig.drawLog = []
    expect(await verifyVerificationPackage(imported)).toEqual({ ok: true, checkedDraws: 1, failedAt: null })
  })

  it('导出的数组与实时场次独立', async () => {
    const pkg = await drawPackage()
    lotteryConfig.drawLog[0].poolIds!.reverse()
    lotteryConfig.drawLog[0].winnerIds[0] = '修改'
    expect((await verifyVerificationPackage(pkg)).ok).toBe(true)
  })

  it.each(['退回奖池', '不再参与'])('完整复算作废（%s）、撤销、重抽', async note => {
    await drawPackage()
    const prize = lotteryConfig.prizeList.find(p => p.everyTimeGet === 10)!
    const [winner] = getRandomCard(prize)
    algorithm.voidWinner(prize.id, winner.id, note === '退回奖池')
    algorithm.undoLastDraw()
    getRandomCard(prize)
    const pkg = fairness.createVerificationPackage()
    expect(pkg.drawLog.map(e => e.type)).toEqual(['draw', 'draw', 'void', 'undo', 'draw'])
    expect(await verifyVerificationPackage(pkg)).toEqual({ ok: true, checkedDraws: 3, failedAt: null })
  })

  it('连续撤销多轮后依然复算被撤销轮消耗的随机流', async () => {
    await drawPackage()
    getRandomCard(lotteryConfig.prizeList[0])
    algorithm.undoLastDraw()
    algorithm.undoLastDraw()
    getRandomCard(lotteryConfig.prizeList[0])
    expect((await fairness.verifyCurrent()).ok).toBe(true)
  })

  it('不能把篡改的奖池作为复算依据', async () => {
    const pkg = await drawPackage()
    pkg.drawLog[0].poolIds = [pkg.drawLog[0].winnerIds[0]]
    expect((await verifyVerificationPackage(pkg)).reason).toContain('有序奖池')
  })

  it('拒绝改变原始名单顺序', async () => {
    const pkg = await drawPackage()
    pkg.roster.reverse()
    expect((await verifyVerificationPackage(pkg)).ok).toBe(false)
  })

  it('拒绝与抽取人数不一致的奖项规则', async () => {
    const pkg = await drawPackage()
    pkg.prizes[0].everyTimeGet = 2
    expect((await verifyVerificationPackage(pkg)).reason).toContain('抽取人数')
  })

  it('拒绝改变中奖人显示姓名', async () => {
    const pkg = await drawPackage()
    pkg.drawLog[0].winnerNames = ['伪造姓名']
    expect((await verifyVerificationPackage(pkg)).ok).toBe(false)
  })

  it('拒绝与流水不符的最终余量', async () => {
    const pkg = await drawPackage()
    pkg.finalState.prizes[0].countRemain++
    expect((await verifyVerificationPackage(pkg)).reason).toContain('最终中奖名单')
  })

  it('拒绝删除作废流水', async () => {
    await drawPackage()
    const prize = lotteryConfig.prizeList[0]
    algorithm.voidWinner(prize.id, prize.cardListWin[0].id, false)
    const pkg = fairness.createVerificationPackage()
    pkg.drawLog = pkg.drawLog.filter(e => e.type !== 'void')
    expect((await verifyVerificationPackage(pkg)).ok).toBe(false)
  })

  it('拒绝没有对应撤销操作的 undone 标记', async () => {
    const pkg = await drawPackage()
    pkg.drawLog[0].undone = true
    expect((await verifyVerificationPackage(pkg)).reason).toContain('撤销标记')
  })

  it('拒绝引用错误轮次的撤销操作', async () => {
    await drawPackage()
    algorithm.undoLastDraw()
    const pkg = fairness.createVerificationPackage()
    pkg.drawLog[1].winnerIds = []
    pkg.drawLog[1].winnerNames = []
    expect((await verifyVerificationPackage(pkg)).reason).toContain('最近一轮')
  })

  it('拒绝重复 ID、未知版本及损坏字段，不抛异常', async () => {
    const pkg = await drawPackage()
    for (const malformed of [
      null, { ...pkg, version: 2 }, { ...pkg, algorithm: 'unknown' },
      { ...pkg, roster: [...pkg.roster, pkg.roster[0]] },
      { ...pkg, drawLog: [{ ...pkg.drawLog[0], winnerIds: null }] },
      { ...pkg, finalState: { ...pkg.finalState, prizes: [null] } },
    ]) expect((await verifyVerificationPackage(malformed)).ok).toBe(false)
  })

  it('验证 SHA-256 承诺，并拒绝替换后的承诺', async () => {
    await useWebCrypto()
    const pkg = await drawPackage()
    expect(pkg.commitmentAlgorithm).toBe('sha256')
    expect((await verifyVerificationPackage(pkg)).ok).toBe(true)
    pkg.seedCommit = await hashSeed(pkg.seed + 1)
    expect((await verifyVerificationPackage(pkg)).reason).toContain('承诺不一致')
  })

  it('FNV 兼容包移到支持 SHA-256 的环境仍按原算法验证', async () => {
    vi.stubGlobal('crypto', {})
    const pkg = await drawPackage()
    expect(pkg.commitmentAlgorithm).toBe('fnv1a32')
    await useWebCrypto()
    expect((await verifyVerificationPackage(pkg)).ok).toBe(true)
  })

  it('不支持 SHA-256 的环境明确报告无法验证，不假报承诺错误', async () => {
    await useWebCrypto()
    const pkg = await drawPackage()
    vi.stubGlobal('crypto', {})
    expect((await verifyVerificationPackage(pkg)).reason).toContain('无法验证 SHA-256')
  })
})

describe('现有抽奖规则的验证兼容', () => {
  async function configurePrize(count: number, everyTimeGet: number) {
    const prize = lotteryConfig.prizeList[0]
    prize.count = count
    prize.countRemain = count
    prize.everyTimeGet = everyTimeGet
    await fairness.ensureSeedCommit()
    return prize
  }

  it('兼容已被配置入口接受的小数每轮人数，按实际循环向上取整抽取', async () => {
    const { parseConfigJson } = await import('./config-store')
    const imported = parseConfigJson(JSON.stringify({
      version: 1, headerTitle: '旧配置', roster: ['甲', '乙', '丙'],
      prizes: [{ name: '奖项', count: 3, everyTimeGet: 1.5 }],
    }))
    expect(imported).not.toBeNull()
    const prize = await configurePrize(3, 1.5)
    expect(getRandomCard(prize)).toHaveLength(2)
    expect(prize.countRemain).toBe(1)
    expect((await fairness.verifyCurrent()).ok).toBe(true)
  })

  it('兼容小数总名额，逐轮实际余额可以低于零且不能被钳制', async () => {
    const prize = await configurePrize(1.5, 1)
    expect(getRandomCard(prize)).toHaveLength(1)
    expect(prize.countRemain).toBe(0.5)
    expect((await fairness.verifyCurrent()).ok).toBe(true)
    expect(getRandomCard(prize)).toHaveLength(1)
    expect(prize.countRemain).toBe(-0.5)
    expect((await fairness.verifyCurrent()).ok).toBe(true)
    const pkg = fairness.createVerificationPackage()
    pkg.finalState.prizes[0].countRemain = 0
    expect((await verifyVerificationPackage(pkg)).ok).toBe(false)
  })

  it('小数名额的抽奖、作废和撤销保持真实余额', async () => {
    const prize = await configurePrize(1.5, 1.5)
    const [winner] = getRandomCard(prize)
    expect(prize.countRemain).toBe(-0.5)
    algorithm.voidWinner(prize.id, winner.id, false)
    expect(prize.countRemain).toBe(0.5)
    algorithm.undoLastDraw()
    expect(prize.countRemain).toBe(1.5)
    expect((await fairness.verifyCurrent()).ok).toBe(true)
  })

  it('拒绝奖项已经抽完后追加的空抽奖记录，即使最终轮数也被同步篡改', async () => {
    const prize = await configurePrize(1, 1)
    getRandomCard(prize)
    const pkg = fairness.createVerificationPackage()
    pkg.drawLog.push({
      type: 'draw', at: Date.now(), prizeId: prize.id, prizeName: prize.name,
      winnerIds: [], winnerNames: [], rngStateBefore: pkg.finalState.rngState,
      poolIds: lotteryConfig.cardListRemainAll.map(c => c.id),
    })
    pkg.finalState.prizes[0].round++
    expect(await verifyVerificationPackage(pkg)).toMatchObject({ ok: false, failedAt: 1 })
  })

  it('保留当前 UI 可产生的空池历史：仍有名额但全部参与者已被作废排除', async () => {
    const prize = await configurePrize(1, 1)
    lotteryConfig.prizeList = [prize]
    lotteryConfig.cardList = lotteryConfig.cardList.slice(0, 1)
    lotteryConfig.cardListRemainAll = [...lotteryConfig.cardList]
    const [winner] = getRandomCard(prize)
    algorithm.voidWinner(prize.id, winner.id, false)
    expect(prize.countRemain).toBe(1)
    expect(lotteryConfig.cardListRemainAll).toHaveLength(0)
    expect(getRandomCard(prize)).toHaveLength(0)
    expect(prize.round).toBe(2)
    expect((await fairness.verifyCurrent()).ok).toBe(true)
  })
})
