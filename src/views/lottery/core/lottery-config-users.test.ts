import { describe, it, expect } from 'vitest'
import { buildCards, calcColCount } from './lottery-config-users'

describe('calcColCount', () => {
  it('至少为 1', () => {
    expect(calcColCount(1)).toBeGreaterThanOrEqual(1)
  })

  it('人数越多列数不减少', () => {
    expect(calcColCount(100)).toBeGreaterThanOrEqual(calcColCount(10))
  })
})

describe('buildCards', () => {
  it('重名自动加序号区分 id，name 保持原样', () => {
    const { cardList } = buildCards([{ name: '张三' }, { name: '张三' }, { name: '张三' }])
    expect(cardList.map(c => c.id)).toEqual(['张三', '张三-2', '张三-3'])
    expect(cardList.map(c => c.name)).toEqual(['张三', '张三', '张三'])
  })

  it('没有头像时自动生成 SVG 头像', () => {
    const { cardList } = buildCards([{ name: '张三' }])
    expect(cardList[0].avatar).toMatch(/^data:image\/svg\+xml/)
  })

  it('提供头像时保留原头像', () => {
    const { cardList } = buildCards([{ name: '张三', avatar: 'http://example.com/a.png' }])
    expect(cardList[0].avatar).toBe('http://example.com/a.png')
  })

  it('row/col 从 1 开始按列数折行', () => {
    const people = Array.from({ length: 5 }, (_, i) => ({ name: `人${i}` }))
    const { cardList, colCount, rowCount } = buildCards(people)
    expect(cardList[0]).toMatchObject({ row: 1, col: 1, index: 0 })
    expect(cardList[colCount]?.row ?? 2).toBe(2) // 第二行第一个（人数不足一行时跳过）
    expect(rowCount).toBe(Math.ceil(5 / colCount))
  })
})
