import { describe, it, expect, vi } from 'vitest'
import { subscribeLottery, notifyLotteryChange, getLotteryVersion } from './lottery-store'

describe('lottery-store', () => {
  it('notify 后版本号递增', () => {
    const before = getLotteryVersion()
    notifyLotteryChange()
    expect(getLotteryVersion()).toBe(before + 1)
  })

  it('notify 时调用所有订阅者', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeLottery(a)
    const offB = subscribeLottery(b)
    notifyLotteryChange()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    offA()
    offB()
  })

  it('退订后不再收到通知', () => {
    const fn = vi.fn()
    const off = subscribeLottery(fn)
    notifyLotteryChange()
    off()
    notifyLotteryChange()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
