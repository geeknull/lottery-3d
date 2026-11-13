import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import LotteryWinBanner from './LotteryWinBanner'
import { bus } from '../core/event-bus'
import STATUS from '../core/lottery-status'
import type { Card } from '../core/lottery-types'

afterEach(cleanup)

// 名单里有两个张伟（不同工号）和一个只有部门的重名者
vi.mock('../core/lottery-config', () => ({
  default: {
    cardList: [
      { name: '张伟', id: '张伟', employeeId: 'A001', avatar: '', index: 0, row: 1, col: 1 },
      { name: '张伟', id: '张伟-2', employeeId: 'A002', avatar: '', index: 1, row: 1, col: 2 },
      { name: '王芳', id: '王芳', department: '研发部', avatar: '', index: 2, row: 1, col: 3 },
      { name: '王芳', id: '王芳-2', department: '市场部', avatar: '', index: 3, row: 1, col: 4 },
      { name: '李娜', id: '李娜', employeeId: 'A003', avatar: '', index: 4, row: 1, col: 5 },
    ],
  },
}))

function makeCard(name: string, index: number): Card {
  return { name, id: name, avatar: 'data:image/svg+xml;utf8,x', index, row: 1, col: index + 1 }
}

function reveal(prizeName: string, names: string[]) {
  act(() => {
    bus.emit('lottery-win-reveal', { prizeName, winners: names.map(makeCard) })
  })
}

describe('LotteryWinBanner', () => {
  it('开奖事件触发后展示奖项名与全部中奖人', () => {
    render(<LotteryWinBanner />)
    reveal('特等奖', ['张三', '李四'])
    expect(screen.getByText('特等奖')).toBeTruthy()
    expect(screen.getByText('张三')).toBeTruthy()
    expect(screen.getByText('李四')).toBeTruthy()
  })

  it('点击横幅关闭', () => {
    render(<LotteryWinBanner />)
    reveal('一等奖', ['王五'])
    fireEvent.click(screen.getByText('一等奖'))
    expect(screen.queryByText('一等奖')).toBeNull()
  })

  it('定格与分组展示保留标题，下一轮准备时收起', () => {
    render(<LotteryWinBanner />)
    act(() => STATUS.setPhase('presenting'))
    reveal('二等奖', ['赵六'])
    act(() => STATUS.setPhase('transitioning'))
    act(() => STATUS.setPhase('presenting'))
    expect(screen.getByText('二等奖')).toBeTruthy()
    act(() => STATUS.setPhase('preparing'))
    expect(screen.queryByText('二等奖')).toBeNull()
  })

  it('连续开奖时展示最新一轮', () => {
    render(<LotteryWinBanner />)
    reveal('三等奖', ['张三'])
    reveal('三等奖', ['李四'])
    expect(screen.getByText('李四')).toBeTruthy()
    expect(screen.queryByText('张三')).toBeNull()
  })

  it('只对重名者加后缀：优先工号，没有工号用部门', () => {
    render(<LotteryWinBanner />)
    act(() => {
      bus.emit('lottery-win-reveal', { prizeName: '一等奖', winners: [
        { ...makeCard('张伟', 0), id: '张伟-2', employeeId: 'A002' },
        { ...makeCard('王芳', 1), department: '市场部' },
        { ...makeCard('李娜', 2), employeeId: 'A003' },
      ] })
    })
    expect(screen.getByText('张伟（A002）')).toBeTruthy()
    expect(screen.getByText('王芳（市场部）')).toBeTruthy()
    expect(screen.getByText('李娜')).toBeTruthy()
  })
})
