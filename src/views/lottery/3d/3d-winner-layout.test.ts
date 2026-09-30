import { describe, expect, it } from 'vitest'
import { getWinnerLayout } from './3d-winner-layout'

const cardSize = { width: 120, height: 160 }

describe('getWinnerLayout', () => {
  it('没有中奖人时返回空布局', () => {
    expect(getWinnerLayout(0, 16 / 9, cardSize)).toEqual({ width: 0, height: 0, positions: [] })
  })

  it('单张卡片位于原点，外接框与卡片一致', () => {
    expect(getWinnerLayout(1, 16 / 9, cardSize)).toEqual({
      width: cardSize.width,
      height: cardSize.height,
      positions: [{ x: 0, y: 0 }],
    })
  })

  it.each([1, 7, 10, 20])('%i 人在不同视口都完整居中、互不重叠且每人仅占一个位置', (count) => {
    for (const aspect of [0.05, 9 / 16, 1, 16 / 9, 20]) {
      const layout = getWinnerLayout(count, aspect, cardSize)
      const xs = layout.positions.map(position => position.x)
      const ys = layout.positions.map(position => position.y)

      expect(layout.positions).toHaveLength(count)
      expect(new Set(layout.positions.map(({ x, y }) => `${x},${y}`)).size).toBe(count)
      expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0)
      expect(Math.min(...ys) + Math.max(...ys)).toBeCloseTo(0)
      expect(Math.max(...xs) - Math.min(...xs) + cardSize.width).toBeCloseTo(layout.width)
      expect(Math.max(...ys) - Math.min(...ys) + cardSize.height).toBeCloseTo(layout.height)

      for (let index = 0; index < count; index++) {
        for (let other = index + 1; other < count; other++) {
          const dx = Math.abs(layout.positions[index].x - layout.positions[other].x)
          const dy = Math.abs(layout.positions[index].y - layout.positions[other].y)
          expect(dx >= cardSize.width + 30 || dy >= cardSize.height + 30).toBe(true)
        }
      }

      const singleRowWidth = count * cardSize.width + (count - 1) * 30
      expect(Math.max(layout.width / aspect, layout.height))
        .toBeLessThanOrEqual(Math.max(singleRowWidth / aspect, cardSize.height))
    }
  })

  it('多人揭晓会随横竖屏改变排法，避免所有卡片挤成一行', () => {
    const narrow = getWinnerLayout(20, 9 / 16, cardSize)
    const wide = getWinnerLayout(20, 16 / 9, cardSize)
    expect(wide.width).toBeGreaterThan(narrow.width)
    expect(wide.height).toBeLessThan(narrow.height)
    expect(new Set(wide.positions.map(position => position.y)).size).toBeGreaterThan(1)
  })

  it('不满一行的中奖人独立居中，并保留从上到下的顺序', () => {
    const { positions } = getWinnerLayout(7, 16 / 9, cardSize)
    const rows = Map.groupBy(positions, position => position.y)
    expect(new Set([...rows.values()].map(row => row.length)).size).toBeGreaterThan(1)
    for (const row of rows.values()) {
      expect(row.reduce((sum, position) => sum + position.x, 0)).toBeCloseTo(0)
      expect(row.map(position => position.x)).toEqual(row.map(position => position.x).toSorted((a, b) => a - b))
    }
    expect(positions.map(position => position.y)).toEqual(positions.map(position => position.y).toSorted((a, b) => b - a))
  })

  it('极窄视口用单列，极宽视口用单行，坐标仍为有限数', () => {
    const narrow = getWinnerLayout(10, Number.MIN_VALUE, cardSize)
    const wide = getWinnerLayout(10, Number.MAX_VALUE, cardSize)
    expect(narrow.width).toBe(cardSize.width)
    expect(wide.height).toBe(cardSize.height)
    for (const layout of [narrow, wide]) {
      expect(Number.isFinite(layout.width)).toBe(true)
      expect(Number.isFinite(layout.height)).toBe(true)
      expect(layout.positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true)
    }
  })

  it.each([0, -1, NaN, Infinity, -Infinity])('宽高比 %s 无效时退回方形视口', (aspect) => {
    expect(getWinnerLayout(7, aspect, cardSize)).toEqual(getWinnerLayout(7, 1, cardSize))
  })

  it('相同取景大小优先更少空位，再优先更少行', () => {
    const square = { width: 100, height: 100 }
    const fewerEmptySeats = getWinnerLayout(7, 3 / 4, square, 0)
    expect(fewerEmptySeats.width).toBe(200)
    expect(fewerEmptySeats.height).toBe(400)

    const fewerRows = getWinnerLayout(6, 1, square, 0)
    expect(fewerRows.width).toBe(300)
    expect(fewerRows.height).toBe(200)
  })

  it('支持自定义卡片大小和间距', () => {
    const layout = getWinnerLayout(2, 20, { width: 90, height: 150 }, 50)
    expect(layout).toEqual({ width: 230, height: 150, positions: [{ x: -70, y: 0 }, { x: 70, y: 0 }] })
  })
})
