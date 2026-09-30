import { describe, expect, it, vi } from 'vitest'
import { checkDualScreen, checkImages, checkOffline, collectConfiguredImages } from './preflight'

describe('preflight evidence', () => {
  it('checks unique configured images, including unresolved IndexedDB references', () => {
    expect(collectConfiguredImages({ version: 1, headerTitle: '场', prizes: [{ name: '奖', count: 1, everyTimeGet: 1, img: 'idb:missing' }], roster: [{ name: '甲', avatar: 'https://a.test/a.png' }, { name: '乙', avatar: 'https://a.test/a.png' }] })).toEqual(['idb:missing', 'https://a.test/a.png'])
  })
  it('reports missing stored images and failed external images', async () => {
    const load = vi.fn(async () => false)
    const result = await checkImages(['idb:missing', 'https://a.test/broken'], { resolve: async () => new Map(), load })
    expect(result.state).toBe('failed')
    expect(result.detail).toContain('2 / 2')
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('does not mistake service-worker registration for full offline readiness', async () => {
    const result = await checkOffline({ controlled: true, cacheAvailable: true, entryUrl: '/index.html', assetUrls: ['/app.js'], imageUrls: [], cached: async url => url !== '/app.js' })
    expect(result.state).toBe('attention')
    expect(result.detail).toContain('1 个未发现')
  })
  it('reports network image dependency despite cached app shell', async () => {
    const result = await checkOffline({ controlled: true, cacheAvailable: true, entryUrl: '/index.html', assetUrls: ['/app.js'], imageUrls: ['idb:photo', 'https://a.test/photo'], cached: async url => !url.startsWith('https:') })
    expect(result.state).toBe('attention')
    expect(result.detail).toContain('1 张链接图片')
  })
  it('reports cached resources only when all required entries exist', async () => {
    const result = await checkOffline({ controlled: true, cacheAvailable: true, entryUrl: '/index.html', assetUrls: ['/app.js'], imageUrls: ['idb:photo'], cached: async () => true })
    expect(result.state).toBe('ready')
    expect(result.detail).toContain('2 个')
  })
  it('returns actionable uncertainty when cache access fails', async () => {
    const result = await checkOffline({ controlled: true, cacheAvailable: true, entryUrl: '/index.html', assetUrls: [], imageUrls: [], cached: async () => { throw new Error('denied') } })
    expect(result.state).toBe('attention')
  })
  it('distinguishes connected, unsupported and isolated rehearsal screens', () => {
    expect(checkDualScreen(true, true, false).state).toBe('ready')
    expect(checkDualScreen(true, false, false).state).toBe('attention')
    expect(checkDualScreen(false, false, false).detail).toContain('不支持')
    expect(checkDualScreen(true, true, true).detail).toContain('隔离')
  })
})
