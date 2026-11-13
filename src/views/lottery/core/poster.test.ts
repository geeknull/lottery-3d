import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportWinnersPoster } from './poster'
import type { Card } from './lottery-types'

const { roster } = vi.hoisted(() => {
  const card = (name: string, id: string, extra: Partial<Card> = {}): Card => ({ name, id, avatar: '', index: 0, row: 1, col: 1, ...extra })
  return { roster: [
    card('张伟', '张伟', { employeeId: 'A001' }),
    card('张伟', '张伟-2', { employeeId: 'A002', department: '市场部' }),
    card('李娜', '李娜', { employeeId: 'A003', department: '研发部' }),
  ] }
})

vi.mock('./lottery-config', () => ({
  default: {
    headerTitle: '年会',
    cardList: roster,
    prizeList: [{ id: '一等奖', name: '一等奖', count: 3, countRemain: 0, everyTimeGet: 3, round: 1, cardListWin: [roster[1], roster[2]] }],
  },
}))

// jsdom 没有 canvas 实现：用假 2D context 记录画了哪些文字。
let drawn: string[]
beforeEach(() => {
  drawn = []
  const gradient = { addColorStop: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    scale: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    createLinearGradient: () => gradient,
    fillText: (text: string) => { drawn.push(text) },
  }) as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,iVBORw0KGgo=')
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('中奖喜报', () => {
  it('只对重名者加工号后缀，不重名者只画姓名', () => {
    expect(exportWinnersPoster()).toBe(true)
    expect(drawn).toContain('张伟（A002）')
    expect(drawn).toContain('李娜')
    expect(drawn).not.toContain('李娜（A003）')
  })
})
