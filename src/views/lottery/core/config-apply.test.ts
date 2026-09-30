import { describe, expect, it, vi } from 'vitest'
import { configHash } from './config-store'
import type { UserLotteryConfig } from './config-store'
import { createConfigApplication, prepareConfig } from './config-apply'

const config: UserLotteryConfig = { version: 1, headerTitle: '活动', prizes: [{ name: '奖', count: 1, everyTimeGet: 1 }], roster: ['甲', '乙'] }
function setup(changed = true) {
  const effects = {
    activeHash: () => changed ? 'old' : configHash(config.headerTitle, config.prizes, config.roster),
    confirmReset: vi.fn(async () => true),
    persistImages: vi.fn(async (value: UserLotteryConfig) => value),
    save: vi.fn(() => true), clearProgress: vi.fn(),
    collectImages: vi.fn(async () => {}), reload: vi.fn(), readOnly: () => false,
  }
  return { effects, apply: createConfigApplication(effects) }
}

describe('configuration application', () => {
  it('does not clear progress or reload when image persistence fails', async () => {
    const { effects, apply } = setup()
    const cause = new Error('quota')
    effects.persistImages.mockRejectedValue(cause)
    await expect(apply(config)).rejects.toMatchObject({
      message: '配置保存失败：图片写入失败，请检查浏览器存储空间后重试', cause,
    })
    expect(effects.save).not.toHaveBeenCalled()
    expect(effects.clearProgress).not.toHaveBeenCalled()
    expect(effects.reload).not.toHaveBeenCalled()
  })
  it('does not clear progress when config storage fails, and allows retry', async () => {
    const { effects, apply } = setup()
    effects.save.mockReturnValueOnce(false)
    await expect(apply(config)).rejects.toThrow('配置保存失败')
    expect(effects.clearProgress).not.toHaveBeenCalled()
    await expect(apply(config)).resolves.toBe('applied')
    expect(effects.clearProgress).toHaveBeenCalledTimes(1)
  })
  it('keeps progress for presentation-only changes and tolerates GC failure', async () => {
    const { effects, apply } = setup(false)
    effects.collectImages.mockRejectedValue(new Error('gc'))
    await expect(apply({ ...config, avatarStyle: 'initials', prizes: [{ ...config.prizes[0], img: 'idb:new' }] })).resolves.toBe('applied')
    expect(effects.confirmReset).not.toHaveBeenCalled()
    expect(effects.clearProgress).not.toHaveBeenCalled()
    expect(effects.reload).toHaveBeenCalledOnce()
  })
  it('prepares and applies ceremonial timing without resetting the draw stream', async () => {
    const { effects, apply } = setup(false)
    const result = prepareConfig({ title: config.headerTitle, prizes: [{ ...config.prizes[0], presentation: 'ceremonial' }], rosterText: '甲\n乙', avatarStyle: 'initials', avatarAutoDowngrade: false })
    expect(result.config?.prizes[0].presentation).toBe('ceremonial')
    if (!result.config) throw new Error('Expected valid presentation mode')
    await expect(apply(result.config)).resolves.toBe('applied')
    expect(effects.confirmReset).not.toHaveBeenCalled()
    expect(effects.clearProgress).not.toHaveBeenCalled()
    expect(effects.save).toHaveBeenCalledWith(result.config)
  })
  it('rejects an invalid presentation value before applying', () => {
    const prize = { ...config.prizes[0] }
    Object.assign(prize, { presentation: 'unknown' })
    const result = prepareConfig({ title: config.headerTitle, prizes: [prize], rosterText: '甲\n乙', avatarStyle: 'initials', avatarAutoDowngrade: false })
    expect(result.error).toBe('揭晓节奏请选择简洁或隆重')
  })
  it('cancels without saving and ignores reentry while confirmation is open', async () => {
    const { effects, apply } = setup()
    let answer: (value: boolean) => void = () => {}
    effects.confirmReset.mockImplementation(() => new Promise(resolve => { answer = resolve }))
    const first = apply(config)
    await expect(apply(config)).resolves.toBe('busy')
    answer(false)
    await expect(first).resolves.toBe('cancelled')
    expect(effects.persistImages).not.toHaveBeenCalled()
  })
  it('blocks all persistence for read-only rehearsal', async () => {
    const { effects } = setup()
    const apply = createConfigApplication({ ...effects, readOnly: () => true })
    await expect(apply(config)).rejects.toThrow('彩排')
    expect(effects.persistImages).not.toHaveBeenCalled()
    expect(effects.save).not.toHaveBeenCalled()
  })
  it.each([0, -1, Infinity, NaN])('rejects invalid prize count %s before applying', count => {
    const result = prepareConfig({ title: '活动', prizes: [{ name: '奖', count, everyTimeGet: 1 }], rosterText: '甲\n乙', avatarStyle: 'initials', avatarAutoDowngrade: false })
    expect(result.error).toContain('有效数字')
  })
  it.each([[1.5, 1], [2, 1.5]])('preserves legacy fractional count %s and per-round count %s when applying', async (count, everyTimeGet) => {
    const result = prepareConfig({ title: '活动', prizes: [{ name: '奖', count, everyTimeGet }], rosterText: '甲\n乙', avatarStyle: 'initials', avatarAutoDowngrade: false })
    expect(result.error).toBeUndefined()
    if (!result.config) throw new Error('Expected legacy configuration to remain valid')
    const prepared = result.config
    expect(prepared.prizes[0]).toMatchObject({ count, everyTimeGet })
    const { effects } = setup()
    effects.activeHash = () => configHash(prepared.headerTitle, prepared.prizes, prepared.roster)
    await expect(createConfigApplication(effects)(prepared)).resolves.toBe('applied')
    expect(effects.save).toHaveBeenCalledWith(prepared)
    expect(effects.confirmReset).not.toHaveBeenCalled()
    expect(effects.clearProgress).not.toHaveBeenCalled()
  })
  it.each([Infinity, NaN, 0])('rejects invalid per-round count %s before applying', everyTimeGet => {
    const result = prepareConfig({ title: '活动', prizes: [{ name: '奖', count: 1, everyTimeGet }], rosterText: '甲\n乙', avatarStyle: 'initials', avatarAutoDowngrade: false })
    expect(result.error).toContain('有效数字')
  })
})
