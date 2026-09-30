import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormalUrl, createRehearsalUrl, isRehearsal } from './rehearsal'

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); vi.resetModules() })
afterEach(() => { window.history.replaceState({}, '', '/'); vi.restoreAllMocks() })

describe('isolated rehearsal', () => {
  it('removes formal dual-screen credentials from both entry and exit URLs', () => {
    const url = 'https://example.test/lottery/?role=control&session=secret#fragment'
    expect(createRehearsalUrl(url)).toBe('https://example.test/lottery/?mode=rehearsal')
    expect(createFormalUrl(createRehearsalUrl(url))).toBe('https://example.test/lottery/')
    expect(isRehearsal('?mode=rehearsal')).toBe(true)
    expect(isRehearsal('?role=control')).toBe(false)
  })
  it('draws with a fresh stream without reading or modifying formal progress', async () => {
    const formal = (await import('./lottery-config')).default
    const { getRandomCard: formalDraw } = await import('./lottery-algorithm')
    formalDraw(formal.prizeList[0])
    const saved = localStorage.getItem('___lottery___')
    const formalWinners = formal.cardListWinAll.map(card => card.id)
    window.history.replaceState({}, '', '/?mode=rehearsal')
    vi.resetModules()
    const rehearsal = (await import('./lottery-config')).default
    const { getRandomCard } = await import('./lottery-algorithm')
    expect(rehearsal.drawLog).toEqual([])
    expect(rehearsal.cardListWinAll).toEqual([])
    expect(rehearsal.rngState).toBe(rehearsal.seed)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    getRandomCard(rehearsal.prizeList[0])
    rehearsal.clearLocalStorage()
    expect(rehearsal.cardListWinAll).toHaveLength(1)
    expect(rehearsal.drawLog).toHaveLength(1)
    expect(write).not.toHaveBeenCalled()
    expect(localStorage.getItem('___lottery___')).toBe(saved)
    window.history.replaceState({}, '', '/')
    vi.resetModules()
    const restored = (await import('./lottery-config')).default
    expect(restored.cardListWinAll.map(card => card.id)).toEqual(formalWinners)
    expect(restored.rngState).toBe(formal.rngState)
    expect(restored.drawLog).toEqual(formal.drawLog)
  })
  it('keeps formal configuration read-only', async () => {
    const store = await import('./config-store')
    const config = { version: 1 as const, headerTitle: '正式', prizes: [{ name: '奖', count: 1, everyTimeGet: 1 }], roster: ['甲', '乙'] }
    expect(store.saveUserConfig(config)).toBe(true)
    const saved = localStorage.getItem('___lottery_config___')
    window.history.replaceState({}, '', '/?mode=rehearsal')
    expect(store.loadUserConfig()).toEqual(config)
    expect(store.saveUserConfig({ ...config, headerTitle: '彩排' })).toBe(false)
    store.clearUserConfig()
    expect(localStorage.getItem('___lottery_config___')).toBe(saved)
  })
})
