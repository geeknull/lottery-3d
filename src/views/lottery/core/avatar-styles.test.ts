import { describe, it, expect } from 'vitest'
import {
  AVATAR_STYLES, DEFAULT_AVATAR_STYLE, LIGHT_FALLBACK_STYLE, AVATAR_HEAVY_WARN,
  generateAvatarFor, resolveStyle,
} from './avatar-styles'

describe('AVATAR_STYLES 注册表', () => {
  it('含四个风格，默认与降级目标都在表内', () => {
    const ids = AVATAR_STYLES.map(s => s.id)
    expect(ids).toEqual(['fun-emoji', 'letter-rich', 'letter', 'bottts'])
    expect(ids).toContain(DEFAULT_AVATAR_STYLE)
    expect(ids).toContain(LIGHT_FALLBACK_STYLE)
    expect(AVATAR_STYLES.find(s => s.id === 'bottts')?.heavy).toBe(true)
    expect(AVATAR_STYLES.find(s => s.id === 'fun-emoji')?.heavy).toBe(false)
  })

  it('每个风格都能生成非空 data: 头像', () => {
    for (const s of AVATAR_STYLES) {
      const uri = s.generate('张三')
      expect(uri.startsWith('data:')).toBe(true)
      expect(uri.length).toBeGreaterThan(20)
    }
  })
})

describe('generateAvatarFor 派发', () => {
  it('按 id 生成；letter-rich 含渐变与首字', () => {
    const uri = generateAvatarFor('张三', 'letter-rich')
    expect(uri).toContain('linearGradient')
    expect(decodeURIComponent(uri)).toContain('张')
  })
  it('未知 id 回默认风格（不抛）', () => {
    const uri = generateAvatarFor('张三', 'no-such-style')
    expect(uri.startsWith('data:')).toBe(true)
  })
  it('不传 styleId 用默认', () => {
    expect(generateAvatarFor('张三').startsWith('data:')).toBe(true)
  })
})

describe('resolveStyle 降级', () => {
  it('开降级 + 重风格 + 超阈值 → 轻量', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN + 1, true)).toBe(LIGHT_FALLBACK_STYLE)
  })
  it('未超阈值 → 原样', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN, true)).toBe('bottts')
  })
  it('未开降级 → 原样', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN + 999, false)).toBe('bottts')
  })
  it('非重风格 → 原样', () => {
    expect(resolveStyle('fun-emoji', AVATAR_HEAVY_WARN + 999, true)).toBe('fun-emoji')
  })
  it('非法 id → 默认风格', () => {
    expect(resolveStyle('no-such', 10, false)).toBe(DEFAULT_AVATAR_STYLE)
  })
})
