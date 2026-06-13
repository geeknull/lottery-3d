import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LotteryConfig } from './lottery-config'

async function loadFresh() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const { bus } = await import('./event-bus')
  return { lotteryConfig, bus }
}

let lotteryConfig: LotteryConfig
let bus: Awaited<ReturnType<typeof loadFresh>>['bus']

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ lotteryConfig, bus } = await loadFresh())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setLocalStorage 写入容错', () => {
  it('写入抛配额错误时不冒泡，并发 storage-error 事件', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => lotteryConfig.setLocalStorage()).not.toThrow()
    expect(onErr).toHaveBeenCalledTimes(1)
  })

  it('持续失败只提醒一次（不每轮刷屏）', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(onErr).toHaveBeenCalledTimes(1)
  })

  it('正常写入不报错、不发事件', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    expect(() => lotteryConfig.setLocalStorage()).not.toThrow()
    expect(onErr).not.toHaveBeenCalled()
    expect(localStorage.getItem('___lottery___')).toBeTruthy()
  })
})
