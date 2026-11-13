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

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
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
