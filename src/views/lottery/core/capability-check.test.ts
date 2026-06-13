import { describe, it, expect } from 'vitest'
import { checkCapabilities } from './capability-check'
import type { CapabilityEnv } from './capability-check'

const ALL_OK: CapabilityEnv = { secureContext: true, broadcastChannel: true, indexedDB: true, smallScreen: false }

describe('checkCapabilities', () => {
  it('全部能力可用时无任何提示', () => {
    expect(checkCapabilities(ALL_OK)).toEqual([])
  })

  it('非安全环境提示公平承诺/复制受限', () => {
    const issues = checkCapabilities({ ...ALL_OK, secureContext: false })
    expect(issues).toHaveLength(1)
    expect(issues[0].feature).toContain('承诺')
  })

  it('无 BroadcastChannel 提示双屏不可用', () => {
    const issues = checkCapabilities({ ...ALL_OK, broadcastChannel: false })
    expect(issues).toHaveLength(1)
    expect(issues[0].feature).toBe('双屏遥控')
  })

  it('无 IndexedDB 提示奖品图无法保存', () => {
    const issues = checkCapabilities({ ...ALL_OK, indexedDB: false })
    expect(issues).toHaveLength(1)
    expect(issues[0].feature).toBe('奖品图片')
  })

  it('窄屏提示用大屏展示', () => {
    const issues = checkCapabilities({ ...ALL_OK, smallScreen: true })
    expect(issues).toHaveLength(1)
    expect(issues[0].feature).toContain('大屏')
  })

  it('多项缺失时全部列出', () => {
    const issues = checkCapabilities({ secureContext: false, broadcastChannel: false, indexedDB: false, smallScreen: true })
    expect(issues).toHaveLength(4)
  })
})
