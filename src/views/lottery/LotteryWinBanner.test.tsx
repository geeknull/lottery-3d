import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import LotteryWinBanner from './LotteryWinBanner'
import { bus } from './event-bus'
import type { Card } from './lottery-types'

afterEach(cleanup)

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

  it('到时间自动消失', async () => {
    render(<LotteryWinBanner duration={60} />)
    reveal('二等奖', ['赵六'])
    expect(screen.getByText('二等奖')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('二等奖')).toBeNull(), { timeout: 1500 })
  })

  it('连续开奖时展示最新一轮', () => {
    render(<LotteryWinBanner />)
    reveal('三等奖', ['张三'])
    reveal('三等奖', ['李四'])
    expect(screen.getByText('李四')).toBeTruthy()
    expect(screen.queryByText('张三')).toBeNull()
  })
})
