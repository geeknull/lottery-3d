import { describe, it, expect } from 'vitest'
import { createWinnerLabeler, identityById, rosterHasIdentity } from './participant-identity'
import type { Card } from './lottery-types'

const card = (name: string, id: string, extra: Partial<Card> = {}): Card => ({ name, id, avatar: '', index: 0, row: 1, col: 1, ...extra })

describe('createWinnerLabeler', () => {
  const roster = [
    card('张伟', '张伟', { employeeId: 'A001', department: '研发部' }),
    card('张伟', '张伟-2', { department: '市场部' }),
    card('张伟', '张伟-3'),
    card('李娜', '李娜', { employeeId: 'A003', department: '行政部' }),
  ]
  const label = createWinnerLabeler(roster)

  it('重名者优先显示工号，没有工号显示部门，都没有只显示姓名', () => {
    expect(roster.map(label)).toEqual(['张伟（A001）', '张伟（市场部）', '张伟', '李娜'])
  })

  it('不重名的人即使有工号也只显示姓名', () => {
    expect(label(roster[3])).toBe('李娜')
  })

  it('没有身份列的名单与姓名完全相同', () => {
    const plain = [card('张三', '张三'), card('张三', '张三-2')]
    expect(plain.map(createWinnerLabeler(plain))).toEqual(['张三', '张三'])
  })
})

describe('identityById / rosterHasIdentity', () => {
  it('按 ID 查到对应卡片', () => {
    const roster = [card('张伟', '张伟', { employeeId: 'A1' }), card('张伟', '张伟-2', { employeeId: 'A2' })]
    expect(identityById(roster).get('张伟-2')?.employeeId).toBe('A2')
    expect(rosterHasIdentity(roster)).toBe(true)
    expect(rosterHasIdentity([card('张三', '张三')])).toBe(false)
  })
})
