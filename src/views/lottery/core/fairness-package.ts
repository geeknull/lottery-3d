// 可脱离页面和本地存储使用的验证格式与复算器。名单顺序属于算法输入，不能排序。
import { hashSeed, rngFromState } from './lottery-rng'
import type { DrawLogEntry } from './lottery-types'

export interface VerifyResult {
  ok: boolean
  checkedDraws: number
  failedAt: number | null
  reason?: string
}

export interface VerificationPackage {
  format: 'lottery-3d-verification'
  version: 1
  algorithm: 'mulberry32-v1'
  commitmentAlgorithm: 'sha256' | 'fnv1a32'
  seed: number
  seedCommit: string
  roster: { id: string; name: string }[]
  prizes: { id: string; name: string; count: number; everyTimeGet: number }[]
  drawLog: DrawLogEntry[]
  finalState: {
    rngState: number
    excludedIds: string[]
    prizes: { id: string; countRemain: number; round: number; winnerIds: string[] }[]
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function uint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

// 旧配置入口允许 >= 1 的小数；复算必须沿用实际抽取循环，不能事后收紧为整数规则。
function prizeRuleNumber(value: unknown): value is number {
  return finiteNumber(value) && value >= 1
}

function validEntry(value: unknown): value is DrawLogEntry {
  if (!record(value) || (value.type !== 'draw' && value.type !== 'void' && value.type !== 'undo')) return false
  return typeof value.at === 'number' && Number.isFinite(value.at) &&
    typeof value.prizeId === 'string' && typeof value.prizeName === 'string' &&
    strings(value.winnerIds) && strings(value.winnerNames) &&
    (value.note === undefined || typeof value.note === 'string') &&
    (value.undone === undefined || typeof value.undone === 'boolean') &&
    (value.type !== 'draw' || (uint32(value.rngStateBefore) && strings(value.poolIds)))
}

function validPackage(value: unknown): value is VerificationPackage {
  if (!record(value) || value.format !== 'lottery-3d-verification' || value.version !== 1 ||
    value.algorithm !== 'mulberry32-v1' || !uint32(value.seed) || typeof value.seedCommit !== 'string') return false
  if (value.commitmentAlgorithm !== 'sha256' && value.commitmentAlgorithm !== 'fnv1a32') return false
  if (!Array.isArray(value.roster) || value.roster.length === 0 ||
    !value.roster.every(p => record(p) && typeof p.id === 'string' && typeof p.name === 'string')) return false
  if (!Array.isArray(value.prizes) || value.prizes.length === 0 ||
    !value.prizes.every(p => record(p) && typeof p.id === 'string' && typeof p.name === 'string' &&
      prizeRuleNumber(p.count) && prizeRuleNumber(p.everyTimeGet))) return false
  if (!Array.isArray(value.drawLog) || !value.drawLog.every(validEntry)) return false
  const state = value.finalState
  return record(state) && uint32(state.rngState) && strings(state.excludedIds) &&
    Array.isArray(state.prizes) && state.prizes.every(p => record(p) && typeof p.id === 'string' &&
      finiteNumber(p.countRemain) && uint32(p.round) && strings(p.winnerIds))
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

// 与 lottery-rng 在非安全上下文生成的旧承诺兼容，不能在 HTTPS 环境中改用 SHA-256 复核它。
function legacyCommit(seed: number): string {
  let hash = 0x811c9dc5
  for (const char of `lottery-3d-seed:${seed}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// 只依赖输入包；不读取当前场次。导入 JSON 后可在另一设备独立运行。
export async function verifyVerificationPackage(value: unknown): Promise<VerifyResult> {
  let checkedDraws = 0
  const fail = (reason: string, failedAt: number | null = null): VerifyResult =>
    ({ ok: false, checkedDraws, failedAt, reason })
  if (!validPackage(value)) return fail('验证文件格式无效或版本不受支持')
  const pkg = value
  let commit: string
  if (pkg.commitmentAlgorithm === 'fnv1a32') {
    commit = legacyCommit(pkg.seed)
  } else {
    if (!globalThis.crypto?.subtle) return fail('此环境无法验证 SHA-256 承诺，请在 HTTPS 或 localhost 打开')
    try {
      commit = await hashSeed(pkg.seed)
    } catch {
      return fail('无法计算种子承诺，请稍后重试')
    }
  }
  if (commit !== pkg.seedCommit) return fail('种子与已公布的承诺不一致')

  const names = new Map(pkg.roster.map(p => [p.id, p.name]))
  const prizes = new Map(pkg.prizes.map(p => [p.id, { ...p, winners: new Set<string>(), round: 0 }]))
  if (names.size !== pkg.roster.length || prizes.size !== pkg.prizes.length) return fail('名单或奖项 ID 重复')
  const winners = new Set<string>()
  const excluded = new Set<string>()
  const activeDraws: number[] = []
  const undone = new Set<number>()
  const rng = rngFromState(pkg.seed)

  for (let i = 0; i < pkg.drawLog.length; i++) {
    const entry = pkg.drawLog[i]
    const prize = prizes.get(entry.prizeId)
    if (!prize || prize.name !== entry.prizeName ||
      !same(entry.winnerNames, entry.winnerIds.map(id => names.get(id) ?? '')) ||
      entry.winnerIds.some(id => !names.has(id))) return fail('奖项或中奖人信息与名单不一致', i)

    if (entry.type === 'draw') {
      const remaining = prize.count - prize.winners.size
      if (remaining <= 0) return fail('奖项名额已耗尽，不能追加抽奖记录', i)
      const pool = pkg.roster.map(p => p.id).filter(id => !winners.has(id) && !excluded.has(id))
      if (entry.rngStateBefore !== rng.getState() || !same(entry.poolIds ?? [], pool)) {
        return fail('随机状态或有序奖池与之前的操作不一致', i)
      }
      const count = Math.min(remaining, prize.everyTimeGet, pool.length)
      const picked: string[] = []
      for (let k = 0; k < count; k++) picked.push(pool.splice(rng.nextInt(0, pool.length - 1), 1)[0])
      if (!same(entry.winnerIds, picked)) return fail('中奖结果或抽取人数与规则复算不一致', i)
      picked.forEach(id => { winners.add(id); prize.winners.add(id) })
      prize.round++
      activeDraws.push(i)
      checkedDraws++
    } else if (entry.type === 'void') {
      const [id] = entry.winnerIds
      if (entry.winnerIds.length !== 1 || !prize.winners.has(id) ||
        (entry.note !== '退回奖池' && entry.note !== '不再参与')) return fail('作废记录没有对应的有效中奖或奖池处理规则', i)
      prize.winners.delete(id)
      winners.delete(id)
      if (entry.note === '不再参与') excluded.add(id)
    } else {
      const drawIndex = activeDraws.pop()
      const draw = drawIndex === undefined ? undefined : pkg.drawLog[drawIndex]
      if (!draw || draw.prizeId !== entry.prizeId || !same(draw.winnerIds, entry.winnerIds)) {
        return fail('撤销记录与最近一轮有效抽奖不一致', i)
      }
      draw.winnerIds.forEach(id => { prize.winners.delete(id); winners.delete(id) })
      prize.round--
      undone.add(drawIndex!)
    }
  }
  if (pkg.drawLog.some((entry, i) => entry.type === 'draw' && Boolean(entry.undone) !== undone.has(i))) {
    return fail('抽奖撤销标记与撤销流水不一致')
  }
  const state = pkg.finalState
  if (state.rngState !== rng.getState() || !same(state.excludedIds, [...excluded]) ||
    state.prizes.length !== prizes.size || new Set(state.prizes.map(p => p.id)).size !== prizes.size ||
    state.prizes.some(p => {
      const replayed = prizes.get(p.id)
      return !replayed || p.countRemain !== replayed.count - replayed.winners.size ||
        p.round !== replayed.round || !same(p.winnerIds, [...replayed.winners])
    })) return fail('最终中奖名单、剩余名额或随机状态与操作流水不一致')
  return { ok: true, checkedDraws, failedAt: null }
}
