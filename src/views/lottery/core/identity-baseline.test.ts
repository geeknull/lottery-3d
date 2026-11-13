// 基线回归：夹具由 4f3b0a9（加身份列之前）的生产构建导出，见 plans/018。
// 没有身份列的名单，旧存档必须照常恢复，指纹、验证文件和两种 CSV 必须逐字节不变。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configHash, normalizeRoster, parseConfigJson } from './config-store'
import type { UserLotteryConfig } from './config-store'
import storageRaw from './__fixtures__/baseline-4f3b0a9/storage-v2.json?raw'

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
afterEach(() => vi.restoreAllMocks())

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
