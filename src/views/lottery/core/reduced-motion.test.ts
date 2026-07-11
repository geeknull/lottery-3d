import { describe, it, expect, afterEach, vi } from 'vitest'
import { prefersReducedMotion } from './reduced-motion'

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('matchMedia 命中 reduce 时为 true', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    expect(prefersReducedMotion()).toBe(true)
  })

  it('未命中时为 false', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })

  it('环境无 matchMedia（老浏览器/SSR）时为 false，不抛错', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
  })
})
