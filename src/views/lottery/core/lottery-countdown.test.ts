import { describe, it, expect, beforeEach } from 'vitest'
import { runCountdown, isCountdownEnabled, setCountdownEnabled } from './lottery-countdown'

beforeEach(() => localStorage.clear())

describe('开关', () => {
  it('默认开启', () => {
    expect(isCountdownEnabled()).toBe(true)
  })
  it('关闭后持久化', () => {
    setCountdownEnabled(false)
    expect(isCountdownEnabled()).toBe(false)
    expect(localStorage.getItem('___lottery_countdown___')).toBe('off')
  })
})

describe('runCountdown', () => {
  it('从 3 依次播报 3→2→1→0(GO)→-1(隐藏)', async () => {
    const ticks: number[] = []
    await runCountdown(3, { onTick: n => ticks.push(n), wait: async () => {} })
    expect(ticks).toEqual([3, 2, 1, 0, -1])
  })

  it('每个倒数数字触发一次 beep（GO 与隐藏不发声）', async () => {
    let beeps = 0
    await runCountdown(3, { onTick: () => {}, wait: async () => {}, beep: () => beeps++ })
    expect(beeps).toBe(3)
  })

  it('每步之间等待（数字之间 + GO 停留）', async () => {
    const waits: number[] = []
    await runCountdown(3, { onTick: () => {}, wait: async ms => { waits.push(ms) } })
    expect(waits.length).toBe(4) // 3、2、1 各一次 + GO 停留一次
    expect(waits.every(ms => ms > 0)).toBe(true)
  })

  it('支持自定义起始秒数', async () => {
    const ticks: number[] = []
    await runCountdown(5, { onTick: n => ticks.push(n), wait: async () => {} })
    expect(ticks).toEqual([5, 4, 3, 2, 1, 0, -1])
  })
})
