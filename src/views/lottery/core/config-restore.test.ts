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
})
