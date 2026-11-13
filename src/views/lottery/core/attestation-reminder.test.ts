import { beforeEach, describe, expect, it } from 'vitest'
import { markAttestationShown, resetAttestationReminder, takeStartReminder, wasAttestationShown } from './attestation-reminder'

beforeEach(resetAttestationReminder)

describe('开始时的公证卡提醒', () => {
  it('第一次开始且没打开过卡片时提醒一次，之后不再提醒', () => {
    expect(takeStartReminder(false)).toBe(true)
    expect(takeStartReminder(false)).toBe(false)
  })

  it('打开过公证卡就不提醒', () => {
    markAttestationShown()
    expect(wasAttestationShown()).toBe(true)
    expect(takeStartReminder(false)).toBe(false)
  })

  it('场次已有抽奖记录时第一次开始也不提醒，之后也不会补提醒', () => {
    expect(takeStartReminder(true)).toBe(false)
    expect(takeStartReminder(false)).toBe(false)
  })
})
