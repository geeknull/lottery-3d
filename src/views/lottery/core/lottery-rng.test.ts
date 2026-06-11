import { describe, it, expect } from 'vitest'
import { createRng, rngFromState, randomSeed, hashSeed, replaySequence } from './lottery-rng'

describe('createRng', () => {
  it('同种子产生完全相同的序列（可复现）', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 10 }, () => a.next())
    const seqB = Array.from({ length: 10 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('不同种子产生不同序列', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('next 落在 [0,1)', () => {
    const rng = createRng(42)
    for (let i = 0; i < 100; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('nextInt 落在 [min,max] 闭区间', () => {
    const rng = createRng(7)
    for (let i = 0; i < 200; i++) {
      const v = rng.nextInt(3, 8)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(8)
      expect(Number.isInteger(v)).toBe(true)
    }
  })
})

describe('rngFromState 状态续接', () => {
  it('保存状态后恢复，续接出与原流一致的后续序列', () => {
    const rng = createRng(999)
    rng.next(); rng.next(); rng.next() // 推进 3 次
    const state = rng.getState()
    const continuation = [rng.next(), rng.next()]

    const resumed = rngFromState(state)
    expect([resumed.next(), resumed.next()]).toEqual(continuation)
  })
})

describe('randomSeed', () => {
  it('返回 32 位无符号整数', () => {
    const s = randomSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('hashSeed 承诺哈希', () => {
  it('同种子哈希确定一致', async () => {
    expect(await hashSeed(123456)).toBe(await hashSeed(123456))
  })

  it('不同种子哈希不同', async () => {
    expect(await hashSeed(1)).not.toBe(await hashSeed(2))
  })

  it('是 64 位十六进制（SHA-256）', async () => {
    expect(await hashSeed(42)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('replaySequence 离线复算验证', () => {
  // 复算「从一个池子里按 rng 依次不放回抽取」的结果
  function drawFrom(seed: number, pool: string[], count: number): string[] {
    const rng = createRng(seed)
    const copy = [...pool]
    const picked: string[] = []
    for (let i = 0; i < count; i++) {
      const idx = rng.nextInt(0, copy.length - 1)
      picked.push(copy.splice(idx, 1)[0])
    }
    return picked
  }

  it('给定种子与池子，能复算出相同的抽取结果', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f']
    const first = drawFrom(7, pool, 3)
    const replayed = replaySequence(7, pool, 3)
    expect(replayed).toEqual(first)
  })

  it('种子不符则复算结果不同（能识别篡改）', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f']
    const honest = replaySequence(7, pool, 3)
    const tampered = replaySequence(8, pool, 3)
    expect(tampered).not.toEqual(honest)
  })
})
