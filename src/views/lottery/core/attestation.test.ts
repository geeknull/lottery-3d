import { describe, expect, it } from 'vitest'
import { attestationUnavailableReason, buildAttestation, commitKind, compareFingerprint, groupFingerprint, normalizeFingerprint, readPackageCommit } from './attestation'
import type { AttestationInput } from './attestation'

const commit = '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'
const salt = 'f'.repeat(63) + 'e'
const base: AttestationInput = {
  title: '年会抽奖',
  seedCommit: commit,
  seedSalt: salt,
  rosterCount: 3,
  prizes: [{ name: '一等奖', count: 2, everyTimeGet: 1 }, { name: '兼容奖', count: 1.5, everyTimeGet: 1 }],
  drawLog: [],
  rehearsal: false,
  now: new Date(2026, 10, 13, 9, 5, 7),
}

describe('公证卡指纹状态', () => {
  it('区分生成中、8 位 FNV、旧存档无盐和加盐 SHA-256', () => {
    expect(commitKind('', salt)).toBe('pending')
    expect(commitKind('1a2b3c4d', '')).toBe('fnv')
    expect(commitKind(commit, '')).toBe('unsalted')
    expect(commitKind(commit, salt)).toBe('salted')
  })

  it('FNV 和生成中不出卡，并给出置灰原因', () => {
    expect(buildAttestation({ ...base, seedCommit: '1a2b3c4d', seedSalt: '' })).toBeNull()
    expect(buildAttestation({ ...base, seedCommit: '' })).toBeNull()
    expect(attestationUnavailableReason('fnv')).toBe('此环境只有非加密的 8 位指纹，请用 HTTPS 或 localhost 打开')
    expect(attestationUnavailableReason('pending')).toContain('生成中')
    expect(attestationUnavailableReason('salted')).toBeNull()
    expect(attestationUnavailableReason('unsalted')).toBeNull()
  })

  it('加盐卡写明绑定名单（含工号，如有）和奖项规则', () => {
    const card = buildAttestation(base)!
    expect(card.kind).toBe('salted')
    expect(card.binding).toContain('含工号（如有）')
    expect(card.binding).toContain('奖项规则')
    expect(card.algorithm).toContain('SHA-256（含随机盐）')
    expect(card.algorithm).toContain('mulberry32-v1')
  })

  it('旧存档无盐卡显示“仅绑定种子，不绑定名单和奖项规则”', () => {
    const card = buildAttestation({ ...base, seedSalt: '' })!
    expect(card.kind).toBe('unsalted')
    expect(card.binding).toBe('仅绑定种子，不绑定名单和奖项规则')
    expect(card.algorithm).toContain('无盐')
  })
})

describe('公证卡内容', () => {
  it('指纹每 8 位一组、两行各 4 组，短码是前 8 位', () => {
    const card = buildAttestation(base)!
    expect(card.groups).toEqual(['1a2b3c4d', '5e6f7081', '92a3b4c5', 'd6e7f809', '1a2b3c4d', '5e6f7081', '92a3b4c5', 'd6e7f809'])
    expect(card.rows[0]).toEqual(card.groups.slice(0, 4))
    expect(card.rows[1]).toEqual(card.groups.slice(4))
    expect(card.groups.join('')).toBe(commit)
    expect(card.shortCode).toBe('1a2b3c4d')
    expect(groupFingerprint('1a2b3c4d')).toEqual(['1a2b3c4d'])
  })

  it('标题、人数、奖项摘要、本机时间说明和核对方法', () => {
    const card = buildAttestation(base)!
    expect(card.title).toBe('年会抽奖 开抽前公证卡')
    expect(card.rosterLine).toBe('名单 3 人')
    expect(card.prizeLines).toEqual(['一等奖 × 2（每轮 1 人）', '兼容奖 × 1.5（每轮 1 人）'])
    expect(card.generatedAt).toBe('2026-11-13 09:05:07')
    expect(card.timeNote).toBe('本机时间，不能作为公布时间的证明')
    expect(card.verifySteps).toHaveLength(3)
    expect(card.verifySteps.join('')).toContain('验证文件')
  })

  it('未抽显示“开抽前”，已抽显示红字标签；撤销过的轮次也计入', () => {
    expect(buildAttestation(base)!.stageLabel).toBe('开抽前')
    expect(buildAttestation(base)!.drawnRounds).toBe(0)
    const drawn = buildAttestation({ ...base, drawLog: [{ type: 'draw' }, { type: 'void' }, { type: 'undo' }, { type: 'draw' }] })!
    expect(drawn.drawnRounds).toBe(2)
    expect(drawn.stageLabel).toBe('本场已抽 2 轮，此卡不是开抽前凭证')
  })

  it('彩排卡带水印，正式卡没有', () => {
    expect(buildAttestation(base)!.watermark).toBeNull()
    expect(buildAttestation({ ...base, rehearsal: true })!.watermark).toBe('彩排，不具效力')
  })

  // 输入只有人数，没有姓名；这里再确认输出不带盐，也没有种子字段。
  it('卡片不放种子和盐', () => {
    const card = buildAttestation(base)!
    expect(JSON.stringify(card)).not.toContain(salt)
    expect(Object.keys(card)).not.toContain('seed')
    expect(Object.keys(card)).not.toContain('seedSalt')
  })
})

describe('核对卡片指纹', () => {
  it('忽略空格、换行和大小写', () => {
    expect(normalizeFingerprint(' 1A2B 3c4d\n5E6F\t7081 ')).toBe('1a2b3c4d5e6f7081')
    expect(compareFingerprint('1A2B3C4D 5E6F7081 92A3B4C5 D6E7F809\n1a2b3c4d 5e6f7081 92a3b4c5 d6e7f809', commit)).toEqual({ state: 'match' })
  })

  it('空输入不判定', () => {
    expect(compareFingerprint('   ', commit)).toEqual({ state: 'empty' })
  })

  it('指出第一个不同的分组', () => {
    const third = commit.slice(0, 16) + 'x' + commit.slice(17)
    expect(compareFingerprint(third, commit)).toEqual({ state: 'mismatch', group: 3 })
    const last = commit.slice(0, 63) + '0'
    expect(compareFingerprint(last, commit)).toEqual({ state: 'mismatch', group: 8 })
  })

  it('输入偏短或偏长时，缺失或多出处所在分组为不同分组', () => {
    expect(compareFingerprint(commit.slice(0, 40), commit)).toEqual({ state: 'mismatch', group: 6 })
    expect(compareFingerprint(commit.slice(0, 32), commit)).toEqual({ state: 'mismatch', group: 5 })
    expect(compareFingerprint(commit + 'ab', commit)).toEqual({ state: 'mismatch', group: 9 })
  })

  it('只从验证文件里读出 8 位或 64 位小写十六进制指纹', () => {
    expect(readPackageCommit({ seedCommit: commit })).toBe(commit)
    expect(readPackageCommit({ seedCommit: '1a2b3c4d' })).toBe('1a2b3c4d')
    expect(readPackageCommit({ seedCommit: 'xyz' })).toBeNull()
    expect(readPackageCommit({ seedCommit: 12 })).toBeNull()
    expect(readPackageCommit(null)).toBeNull()
    expect(readPackageCommit('string')).toBeNull()
  })
})
