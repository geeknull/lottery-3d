import { describe, it, expect } from 'vitest'
import { isSavedRestorable } from './config-restore'
import type { Card } from './lottery-types'

const cardList: Card[] = [
  { name: '张三', id: '张三', avatar: '', index: 0, row: 1, col: 1 },
  { name: '李四', id: '李四', avatar: '', index: 1, row: 1, col: 2 },
]

function winner(id: string): Card {
  return { name: id, id, avatar: '', index: 0, row: 1, col: 1 }
}

function baseSaved(overrides: Record<string, unknown> = {}) {
  return {
    cardListWinAll: [winner('张三')],
    cardListRemainAll: [winner('李四')],
    cardListExcluded: [],
    prizeList: [],
    drawLog: [],
    ...overrides,
  }
}

describe('isSavedRestorable', () => {
  it('合法存档可恢复', () => {
    expect(isSavedRestorable(baseSaved(), cardList)).toBe(true)
  })

  it('空中奖名单（还没抽）也可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListWinAll: [], cardListRemainAll: [] }), cardList)).toBe(true)
  })

  it('老存档缺 cardListExcluded 字段可恢复', () => {
    const s = baseSaved()
    delete (s as Record<string, unknown>).cardListExcluded
    expect(isSavedRestorable(s, cardList)).toBe(true)
  })

  it('cardListWinAll 非数组（被篡改）→ 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListWinAll: 'oops' }), cardList)).toBe(false)
  })

  it('cardListRemainAll 非数组 → 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListRemainAll: null }), cardList)).toBe(false)
  })

  it('prizeList 存在但非数组 → 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ prizeList: {} }), cardList)).toBe(false)
  })

  it('中奖 id 不在当前名单（碰撞/换名单）→ 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListWinAll: [winner('王五')] }), cardList)).toBe(false)
  })

  it('中奖名单含 undefined/null 元素 → 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListWinAll: [undefined] }), cardList)).toBe(false)
  })

  it('排除名单 id 不在当前名单 → 不可恢复', () => {
    expect(isSavedRestorable(baseSaved({ cardListExcluded: [winner('赵六')] }), cardList)).toBe(false)
  })

  it('saved 为 null/非对象 → 不可恢复', () => {
    expect(isSavedRestorable(null, cardList)).toBe(false)
    expect(isSavedRestorable('x', cardList)).toBe(false)
  })

  it('v2 ID 数组可恢复，但不混用旧卡片对象或未知版本', () => {
    const compact = baseSaved({ version: 2, cardListWinAll: ['张三'], cardListRemainAll: ['李四'] })
    expect(isSavedRestorable(compact, cardList)).toBe(true)
    expect(isSavedRestorable({ ...compact, version: 3 }, cardList)).toBe(false)
    expect(isSavedRestorable({ ...compact, cardListWinAll: [winner('张三')] }, cardList)).toBe(false)
    expect(isSavedRestorable({ ...compact, cardListRemainAll: ['王五'] }, cardList)).toBe(false)
  })

  it.each([null, undefined, winner('王五'), '李四'])('拒绝旧存档中损坏的剩余卡片：%j', entry => {
    expect(isSavedRestorable(baseSaved({ cardListRemainAll: [entry] }), cardList)).toBe(false)
  })

  it.each([
    null,
    { id: '一等奖', countRemain: 0, round: 1, cardListWin: [null] },
    { id: '一等奖', countRemain: 0, round: 1, cardListWin: [winner('王五')] },
    { id: '一等奖', countRemain: Infinity, round: 1, cardListWin: [] },
    { id: '一等奖', countRemain: 0, round: -1, cardListWin: [] },
    { id: '一等奖', countRemain: 0, round: '1', cardListWin: [] },
  ])('拒绝损坏的奖项或奖项内卡片：%j', prize => {
    expect(isSavedRestorable(baseSaved({ prizeList: [prize] }), cardList)).toBe(false)
  })

  it.each([
    null,
    { type: 'draw', at: 1, prizeId: '一等奖', prizeName: '一等奖', winnerIds: ['张三'], winnerNames: null },
    { type: 'draw', at: 1, prizeId: '一等奖', prizeName: '一等奖', winnerIds: ['王五'], winnerNames: ['王五'] },
  ])('拒绝会破坏历史展示的流水元素：%j', entry => {
    expect(isSavedRestorable(baseSaved({ drawLog: [entry] }), cardList)).toBe(false)
  })
})
