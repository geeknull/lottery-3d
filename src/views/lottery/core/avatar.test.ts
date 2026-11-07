import { describe, it, expect } from 'vitest'
import { generateAvatar } from './avatar'

describe('generateAvatar', () => {
  it('emoji 开头的名字取完整字符，不抛错', () => {
    expect(decodeURIComponent(generateAvatar('🐱小明'))).toContain('>🐱<')
  })

  it('扩展区汉字开头的名字取完整字符', () => {
    expect(decodeURIComponent(generateAvatar('𠮷田'))).toContain('>𠮷<')
  })

  it('孤立代理字符用问号代替，不抛错', () => {
    expect(decodeURIComponent(generateAvatar('\uD83D小明'))).toContain('>?<')
  })

  it.each(['&小红', '<小红', '>小红'])('%s 生成的 SVG 是合法 XML', name => {
    const svg = decodeURIComponent(generateAvatar(name).replace('data:image/svg+xml;utf8,', ''))
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })

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
