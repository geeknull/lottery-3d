// 基线回归：夹具由 4f3b0a9（加身份列之前）的生产构建导出，见 plans/018。
// 没有身份列的名单，旧存档必须照常恢复，指纹、验证文件和两种 CSV 必须逐字节不变。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configHash, normalizeRoster, parseConfigJson } from './config-store'
import type { UserLotteryConfig } from './config-store'
import { buildWinnersCsv } from './config-store'
import { historyToCsv } from './lottery-history'
import storageRaw from './__fixtures__/baseline-4f3b0a9/storage-v2.json?raw'
import winnersCsvRaw from './__fixtures__/baseline-4f3b0a9/winners.csv?raw'
import historyCsvRaw from './__fixtures__/baseline-4f3b0a9/history.csv?raw'
import verificationV2Raw from './__fixtures__/baseline-4f3b0a9/verification-v2.json?raw'
import verificationV1FnvRaw from './__fixtures__/baseline-4f3b0a9/verification-v1-fnv.json?raw'
import verificationV1ShaRaw from './__fixtures__/baseline-4f3b0a9/verification-v1-sha256.json?raw'
import { commitmentContext, verifyVerificationPackage } from './fairness-package'

const storage = JSON.parse(storageRaw) as { progress: string; config: string }
const baselineConfig = parseConfigJson(storage.config) as UserLotteryConfig
const BASELINE_HASH = '42ace6cc' // 基线存档里的 hash 字段

async function loadBaselineSession() {
  vi.resetModules()
  localStorage.clear()
  localStorage.setItem('___lottery_config___', storage.config)
  localStorage.setItem('___lottery___', storage.progress)
  const { default: lotteryConfig } = await import('./lottery-config')
  return lotteryConfig
}

async function stubWebCrypto() {
  const { webcrypto } = await vi.importActual<{ webcrypto: Crypto }>('node:crypto')
  vi.stubGlobal('crypto', webcrypto)
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('基线旧存档', () => {
  it('夹具配置的指纹等于基线存档里的 hash', () => {
    expect(JSON.parse(storage.progress).hash).toBe(BASELINE_HASH)
    expect(configHash(baselineConfig.headerTitle, baselineConfig.prizes, baselineConfig.roster)).toBe(BASELINE_HASH)
  })

  it('只加部门不改变指纹', () => {
    const roster = normalizeRoster(baselineConfig.roster).map((entry, i) => ({ ...entry, department: `部门${i}` }))
    expect(configHash(baselineConfig.headerTitle, baselineConfig.prizes, roster)).toBe(BASELINE_HASH)
  })

  it('新代码照常恢复基线存档，不拒绝、不留底', async () => {
    const lotteryConfig = await loadBaselineSession()
    expect(lotteryConfig.takeRejectedNotice()).toBe(false)
    expect(lotteryConfig.getRejectedProgress()).toBeNull()
    expect(lotteryConfig.drawLog.map(entry => entry.type)).toEqual(['draw', 'draw', 'undo', 'draw'])
    expect(lotteryConfig.cardListWinAll.map(card => card.id)).toEqual(['李娜', '王芳', '杨帆', '陈静'])
    expect(lotteryConfig.seedCommit).toBe(JSON.parse(storage.progress).seedCommit)
  })
})

describe('基线 CSV 逐字节不变', () => {
  it('夹具带 BOM（确认读入的是原始字节）', () => {
    expect(winnersCsvRaw.startsWith('\uFEFF奖项,姓名\n')).toBe(true)
    expect(historyCsvRaw.startsWith('\uFEFF时间,操作,奖项,姓名,备注\n')).toBe(true)
  })

  it('中奖名单 CSV 与基线导出相同', async () => {
    const lotteryConfig = await loadBaselineSession()
    expect(buildWinnersCsv(lotteryConfig.prizeList, lotteryConfig.cardList)).toBe(winnersCsvRaw)
  })

  it('抽奖流水 CSV 与基线导出相同', async () => {
    vi.stubEnv('TZ', 'Asia/Shanghai') // 夹具在该时区的浏览器里导出，时间按本地时区格式化
    const lotteryConfig = await loadBaselineSession()
    expect(historyToCsv(lotteryConfig.drawLog, lotteryConfig.cardList)).toBe(historyCsvRaw)
  })
})

describe('基线验证文件', () => {
  it.each([
    ['v2 加盐 SHA-256', verificationV2Raw, 2, 'sha256-salted', 3],
    ['v1 FNV 兼容指纹', verificationV1FnvRaw, 1, 'fnv1a32', 1],
    ['v1 无盐 SHA-256', verificationV1ShaRaw, 1, 'sha256', 1],
  ])('%s 在新代码下验证通过', async (_label, raw, version, algorithm, draws) => {
    await stubWebCrypto()
    const pkg = JSON.parse(raw)
    expect(pkg.version).toBe(version)
    expect(pkg.commitmentAlgorithm).toBe(algorithm)
    expect(pkg.roster.some((p: object) => 'employeeId' in p)).toBe(false)
    expect(await verifyVerificationPackage(pkg)).toEqual({ ok: true, checkedDraws: draws, failedAt: null })
  })

  it('没有工号时承诺上下文与 [id, name] 写法逐字符相同', () => {
    const pkg = JSON.parse(verificationV2Raw)
    expect(commitmentContext(pkg.roster, pkg.prizes)).toBe(JSON.stringify({
      roster: pkg.roster.map((p: { id: string; name: string }) => [p.id, p.name]),
      prizes: pkg.prizes.map((p: { id: string; name: string; count: number; everyTimeGet: number }) => [p.id, p.name, p.count, p.everyTimeGet]),
    }))
  })

  it('有工号时承诺上下文带上工号，部门不进上下文', () => {
    const prizes = [{ id: '奖', name: '奖', count: 1, everyTimeGet: 1 }]
    const plain = commitmentContext([{ id: '张伟', name: '张伟' }], prizes)
    const withId = commitmentContext([{ id: '张伟', name: '张伟', employeeId: 'A001' }], prizes)
    expect(withId).not.toBe(plain)
    expect(JSON.parse(withId).roster).toEqual([['张伟', '张伟', 'A001']])
    expect(commitmentContext([{ id: '张伟', name: '张伟', department: '研发部' } as { id: string; name: string }], prizes)).toBe(plain)
  })

  it('基线存档在新代码下导出的验证文件与基线导出逐字节相同', async () => {
    await stubWebCrypto()
    const lotteryConfig = await loadBaselineSession()
    expect(lotteryConfig.cardList.length).toBe(10)
    const { createVerificationPackage } = await import('./lottery-fairness')
    expect(JSON.stringify(createVerificationPackage(), null, 2)).toBe(verificationV2Raw)
  })
})

describe('带工号的验证文件', () => {
  const identityConfig: UserLotteryConfig = {
    version: 1,
    headerTitle: '身份列',
    prizes: [{ name: '一等奖', count: 2, everyTimeGet: 2 }],
    roster: [{ name: '张伟', employeeId: 'A001', department: '研发部' }, { name: '张伟', employeeId: 'A002' }, { name: '李娜', department: '市场部' }, '王五'],
  }

  async function identityPackage() {
    await stubWebCrypto()
    vi.resetModules()
    localStorage.clear()
    localStorage.setItem('___lottery_config___', JSON.stringify(identityConfig))
    const { default: lotteryConfig } = await import('./lottery-config')
    const fairness = await import('./lottery-fairness')
    const { getRandomCard } = await import('./lottery-algorithm')
    await fairness.ensureSeedCommit()
    getRandomCard(lotteryConfig.prizeList[0])
    return fairness.createVerificationPackage()
  }

  it('名单只在有工号的条目写 employeeId，不写部门，验证通过', async () => {
    const pkg = await identityPackage()
    expect(pkg.version).toBe(2)
    expect(pkg.roster).toEqual([
      { id: '张伟', name: '张伟', employeeId: 'A001' },
      { id: '张伟-2', name: '张伟', employeeId: 'A002' },
      { id: '李娜', name: '李娜' },
      { id: '王五', name: '王五' },
    ])
    expect((await verifyVerificationPackage(pkg)).ok).toBe(true)
  })

  it('篡改、互换或删除工号都使承诺不一致', async () => {
    const pkg = await identityPackage()
    const [a, b, ...rest] = pkg.roster
    for (const roster of [
      [{ ...a, employeeId: 'A009' }, b, ...rest],
      [{ ...a, employeeId: b.employeeId }, { ...b, employeeId: a.employeeId }, ...rest],
      [{ id: a.id, name: a.name }, b, ...rest],
      [a, b, { ...rest[0], employeeId: 'X1' }, rest[1]],
    ]) expect((await verifyVerificationPackage({ ...pkg, roster })).reason).toContain('承诺不一致')
  })

  it('employeeId 不是非空字符串时判为格式无效', async () => {
    const pkg = await identityPackage()
    for (const employeeId of [1, '', null]) {
      const roster = [{ ...pkg.roster[0], employeeId }, ...pkg.roster.slice(1)]
      expect((await verifyVerificationPackage({ ...pkg, roster })).reason).toContain('格式无效')
    }
  })
})
