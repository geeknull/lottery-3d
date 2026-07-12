import { describe, it, expect, vi } from 'vitest'

// 让 DiceBear 生成抛错，验证 generateAvatarFor 兜底回纯色首字、不抛
vi.mock('@dicebear/core', () => ({
  createAvatar: () => { throw new Error('boom') },
}))

describe('generateAvatarFor 兜底', () => {
  it('DiceBear 抛错时回纯色首字，不抛', async () => {
    const { generateAvatarFor } = await import('./avatar-styles')
    const uri = generateAvatarFor('张三', 'bottts')
    expect(uri.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodeURIComponent(uri)).toContain('张') // 纯色首字含姓氏
  })
})
