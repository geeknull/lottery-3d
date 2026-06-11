import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isSoundEnabled, setSoundEnabled,
  playTick, playReveal, startSpinTicks, stopSpinTicks,
} from './lottery-sound'

beforeEach(() => localStorage.clear())
afterEach(() => stopSpinTicks())

describe('音效开关', () => {
  it('默认开启', () => {
    expect(isSoundEnabled()).toBe(true)
  })

  it('关闭后持久化为关', () => {
    setSoundEnabled(false)
    expect(isSoundEnabled()).toBe(false)
    expect(localStorage.getItem('___lottery_sound___')).toBe('off')
  })

  it('重新开启', () => {
    setSoundEnabled(false)
    setSoundEnabled(true)
    expect(isSoundEnabled()).toBe(true)
  })
})

describe('音频函数在无 Web Audio 环境下静默不抛', () => {
  // jsdom 没有 AudioContext，音效非关键功能，失败应静默
  it('playTick 不抛', () => {
    expect(() => playTick()).not.toThrow()
  })
  it('playReveal 不抛', () => {
    expect(() => playReveal()).not.toThrow()
  })
  it('startSpinTicks / stopSpinTicks 不抛', () => {
    expect(() => { startSpinTicks(); stopSpinTicks() }).not.toThrow()
  })
  it('关闭音效后调用也不抛', () => {
    setSoundEnabled(false)
    expect(() => { playTick(); playReveal(); startSpinTicks(); stopSpinTicks() }).not.toThrow()
  })
})
