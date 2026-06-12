import { describe, it, expect, beforeEach, vi } from 'vitest'

// 每个用例拿一份全新的模块单例
async function fresh() {
  vi.resetModules()
  return await import('./pwa-update')
}

let m: typeof import('./pwa-update')

beforeEach(async () => {
  m = await fresh()
})

describe('PWA 更新状态机', () => {
  it('初始未发现新版', () => {
    expect(m.getNeedRefresh()).toBe(false)
  })

  it('markNeedRefresh 置位并通知订阅者', () => {
    const cb = vi.fn()
    m.subscribeUpdate(cb)
    m.markNeedRefresh()
    expect(m.getNeedRefresh()).toBe(true)
    expect(cb).toHaveBeenCalledWith(true)
  })

  it('取消订阅后不再收到通知', () => {
    const cb = vi.fn()
    const off = m.subscribeUpdate(cb)
    off()
    m.markNeedRefresh()
    expect(cb).not.toHaveBeenCalled()
  })

  it('applyUpdate 调用注入的 updateSW 并要求重载', () => {
    const sw = vi.fn()
    m._setUpdateSW(sw)
    m.applyUpdate()
    expect(sw).toHaveBeenCalledWith(true)
  })

  it('SW 尚未注册时 applyUpdate 不抛', () => {
    expect(() => m.applyUpdate()).not.toThrow()
  })
})
