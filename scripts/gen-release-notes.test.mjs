import { describe, it, expect } from 'vitest'
import { buildReleaseNotes } from './gen-release-notes.mjs'

describe('buildReleaseNotes', () => {
  it('组装 version/build/notes', () => {
    expect(buildReleaseNotes(['改了 A', '改了 B'], '142', '1f9e568'))
      .toEqual({ version: '142', build: '1f9e568', notes: ['改了 A', '改了 B'] })
  })
  it('去两端空白、去空行、去重', () => {
    expect(buildReleaseNotes(['  A  ', '', 'A', 'B'], '1', 'x').notes).toEqual(['A', 'B'])
  })
  it('最多 8 条，保留最先出现的 8 条', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'c' + i)
    expect(buildReleaseNotes(many, '1', 'x').notes).toEqual(many.slice(0, 8))
  })
})
