import { describe, it, expect } from 'vitest'
import { generateAvatar } from './avatar'

describe('generateAvatar', () => {
  it('返回 SVG data URI', () => {
    expect(generateAvatar('张三')).toMatch(/^data:image\/svg\+xml;utf8,/)
  })

  it('头像里包含名字首字', () => {
    const uri = generateAvatar('张三')
    expect(decodeURIComponent(uri)).toContain('>张<')
  })

  it('同名结果确定（可复现）', () => {
    expect(generateAvatar('李四')).toBe(generateAvatar('李四'))
  })

  it('空名字用问号兜底', () => {
    expect(decodeURIComponent(generateAvatar(''))).toContain('>?<')
  })
})
