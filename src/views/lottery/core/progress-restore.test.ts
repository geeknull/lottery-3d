import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compareRoster, comparePrizes, planProgressRestore } from './progress-restore'
import type { VerificationPackage } from './fairness-package'
import type { UserLotteryConfig } from './config-store'
import storageRaw from './__fixtures__/baseline-4f3b0a9/storage-v2.json?raw'
import verificationV2Raw from './__fixtures__/baseline-4f3b0a9/verification-v2.json?raw'
import verificationV1FnvRaw from './__fixtures__/baseline-4f3b0a9/verification-v1-fnv.json?raw'
import verificationV1ShaRaw from './__fixtures__/baseline-4f3b0a9/verification-v1-sha256.json?raw'

const CONFIG: UserLotteryConfig = {
  version: 1,
  headerTitle: '恢复测试',
  prizes: [{ name: '一等奖', count: 3, everyTimeGet: 1 }, { name: '二等奖', count: 2, everyTimeGet: 2 }],
  roster: ['甲', '乙', { name: '张伟', employeeId: 'A001' }, { name: '张伟', employeeId: 'A002' }, '丙', '丁', '戊', '己'],
}

async function stubWebCrypto() {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>('node:crypto')
  vi.stubGlobal('crypto', webcrypto)
}

// 用真实模块跑一场：两轮、作废并不再参与、撤销、跨奖项再抽，覆盖 cardListWinAll 的各种变化。
type Algorithm = typeof import('./lottery-algorithm')
type Prizes = import('./lottery-types').Prize[]
const DEFAULT_SCRIPT = ({ getRandomCard, voidWinner, undoLastDraw }: Algorithm, [first, second]: Prizes) => {
  getRandomCard(first)
  getRandomCard(first)
  voidWinner(first.id, first.cardListWin[0].id, false)
  getRandomCard(second)
  undoLastDraw()
  getRandomCard(second)
  getRandomCard(first)
}

async function playSession(config: UserLotteryConfig = CONFIG, script = DEFAULT_SCRIPT) {
  vi.resetModules()
  localStorage.clear()
  const { saveUserConfig } = await import('./config-store')
  saveUserConfig(config)
  const lotteryConfig = (await import('./lottery-config')).default
  const algorithm = await import('./lottery-algorithm')
  const { ensureSeedCommit, createVerificationPackage } = await import('./lottery-fairness')
  await ensureSeedCommit()
  script(algorithm, lotteryConfig.prizeList)
  return {
    lotteryConfig,
    pkg: JSON.parse(JSON.stringify(createVerificationPackage())) as VerificationPackage,
    stored: JSON.parse(localStorage.getItem('___lottery___')!) as Record<string, unknown>,
  }
}

// 存档里 revision、hash 由写入时决定，currentPrize 恢复后固定为 null，其余进度字段必须逐字段相等。
function progressFields(saved: Record<string, unknown>) {
  const { revision: _revision, hash: _hash, currentPrize: _currentPrize, ...rest } = saved
  return rest
}

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await stubWebCrypto()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('planProgressRestore 重建', () => {
  it('只用验证文件和当前配置重建出与原存档逐字段相同的进度', async () => {
    const { lotteryConfig, pkg, stored } = await playSession()
    expect(pkg.version).toBe(2)
    expect(pkg.drawLog.map(entry => entry.type)).toEqual(['draw', 'draw', 'void', 'draw', 'undo', 'draw', 'draw'])
    expect(pkg.finalState.excludedIds).toHaveLength(1)

    const plan = await planProgressRestore(pkg, lotteryConfig)
    if (!plan.ok) throw new Error(plan.reason)
    expect(plan.saved.currentPrize).toBeNull()
    expect(progressFields(plan.saved as unknown as Record<string, unknown>)).toEqual(progressFields(stored))
    expect(plan.summary).toEqual({ rounds: 4, winners: lotteryConfig.cardListWinAll.length, entries: 7 })
  })

  it('同一轮里先作废一人（退回奖池）再撤销整轮，也逐字段相同', async () => {
    const { lotteryConfig, pkg, stored } = await playSession(CONFIG, ({ getRandomCard, voidWinner, undoLastDraw }, [first, second]) => {
      getRandomCard(first)
      getRandomCard(second)
      voidWinner(second.id, second.cardListWin[1].id, true)
      undoLastDraw()
      getRandomCard(second)
      getRandomCard(first)
    })
    expect(pkg.drawLog.map(entry => entry.type)).toEqual(['draw', 'draw', 'void', 'undo', 'draw', 'draw'])
    const plan = await planProgressRestore(pkg, lotteryConfig)
    if (!plan.ok) throw new Error(plan.reason)
    expect(progressFields(plan.saved as unknown as Record<string, unknown>)).toEqual(progressFields(stored))
  })

  it('基线 v2 验证文件重建出基线存档的进度字段', async () => {
    const storage = JSON.parse(storageRaw) as { progress: string; config: string }
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('___lottery_config___', storage.config)
    const lotteryConfig = (await import('./lottery-config')).default
    const plan = await planProgressRestore(JSON.parse(verificationV2Raw), lotteryConfig)
    if (!plan.ok) throw new Error(plan.reason)
    expect(progressFields(plan.saved as unknown as Record<string, unknown>)).toEqual(progressFields(JSON.parse(storage.progress)))
  })

  it('version 1 的 FNV 文件在没有 crypto.subtle 的环境也能重建，且不写 seedSalt', async () => {
    const storage = JSON.parse(storageRaw) as { config: string }
    vi.stubGlobal('crypto', {})
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('___lottery_config___', storage.config)
    const lotteryConfig = (await import('./lottery-config')).default
    const plan = await planProgressRestore(JSON.parse(verificationV1FnvRaw), lotteryConfig)
    if (!plan.ok) throw new Error(plan.reason)
    expect('seedSalt' in plan.saved).toBe(false)
    expect(plan.saved.seedCommit).toHaveLength(8)
  })

  it('没有 crypto.subtle 时 SHA-256 文件被拒绝，不降级为只看结构', async () => {
    const storage = JSON.parse(storageRaw) as { config: string }
    vi.stubGlobal('crypto', {})
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('___lottery_config___', storage.config)
    const lotteryConfig = (await import('./lottery-config')).default
    for (const raw of [verificationV1ShaRaw, verificationV2Raw]) {
      const plan = await planProgressRestore(JSON.parse(raw), lotteryConfig)
      expect(plan).toEqual({ ok: false, reason: expect.stringContaining('此环境无法验证 SHA-256 承诺') })
    }
  })
})

describe('planProgressRestore 拒绝', () => {
  it('被改过的文件显示校验器原因', async () => {
    const { lotteryConfig, pkg } = await playSession()
    const tampered = { ...pkg, finalState: { ...pkg.finalState, rngState: (pkg.finalState.rngState + 1) >>> 0 } }
    expect(await planProgressRestore(tampered, lotteryConfig)).toEqual({
      ok: false, reason: '验证文件没有通过复算：最终中奖名单、剩余名额或随机状态与操作流水不一致',
    })
    expect(await planProgressRestore({ format: 'nope' }, lotteryConfig)).toEqual({
      ok: false, reason: '验证文件没有通过复算：验证文件格式无效或版本不受支持',
    })
  })

  it('两个同名者工号互换：文件自洽，但与当前名单比对失败', async () => {
    const { lotteryConfig, pkg } = await playSession()
    const swapped = lotteryConfig.cardList.map(card => card.name === '张伟'
      ? { ...card, employeeId: card.employeeId === 'A001' ? 'A002' : 'A001' }
      : card)
    const plan = await planProgressRestore(pkg, { cardList: swapped, prizeList: lotteryConfig.prizeList })
    expect(plan).toEqual({ ok: false, reason: '备份里的名单和当前名单不一致（第 3 位：工号不同，备份是 张伟（工号 A001），当前是 张伟（工号 A002））。请先导入这份备份对应的配置' })
  })

  it('当前名单多一人、奖项规则不同都被拒绝', async () => {
    const { lotteryConfig, pkg } = await playSession()
    const extra = { ...lotteryConfig.cardList[0], id: '庚', name: '庚' }
    expect(await planProgressRestore(pkg, { cardList: [...lotteryConfig.cardList, extra], prizeList: lotteryConfig.prizeList }))
      .toEqual({ ok: false, reason: '备份里的名单和当前名单不一致（人数不同：备份 8 人，当前 9 人）。请先导入这份备份对应的配置' })
    const prizes = lotteryConfig.prizeList.map((prize, i) => (i === 1 ? { ...prize, everyTimeGet: 1 } : prize))
    expect(await planProgressRestore(pkg, { cardList: lotteryConfig.cardList, prizeList: prizes }))
      .toEqual({ ok: false, reason: '备份里的奖项规则和当前不一致（第 2 个奖项：备份是「二等奖：共 2 个，每轮 2 个」，当前是「二等奖：共 2 个，每轮 1 个」）。请先导入这份备份对应的配置' })
  })
})

describe('compareRoster / comparePrizes', () => {
  const p = (id: string, name = id, employeeId?: string) => (employeeId ? { id, name, employeeId } : { id, name })

  it('缺省工号和空串工号视为相同，顺序不同指出位置', () => {
    expect(compareRoster([p('甲'), p('乙')], [{ id: '甲', name: '甲', employeeId: '' }, p('乙')])).toBeNull()
    expect(compareRoster([p('甲'), p('乙')], [p('乙'), p('甲')])).toContain('第 1 位：备份是 甲，当前是 乙')
  })

  it('一方没有工号时写“无工号”，只有 ID 不同时附上 ID', () => {
    expect(compareRoster([p('张伟', '张伟', 'A1')], [p('张伟')])).toContain('备份是 张伟（工号 A1），当前是 张伟（无工号）')
    expect(compareRoster([p('张伟-2', '张伟')], [p('张伟', '张伟')])).toContain('备份是 张伟［ID 张伟-2］，当前是 张伟［ID 张伟］')
  })

  it('奖项个数不同', () => {
    const rule = { id: 'a', name: 'a', count: 1, everyTimeGet: 1 }
    expect(comparePrizes([rule], [rule])).toBeNull()
    expect(comparePrizes([rule], [])).toContain('奖项个数不同：备份 1 个，当前 0 个')
  })
})
