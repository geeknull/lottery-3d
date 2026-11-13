import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LotteryBackupReminder from './LotteryBackupReminder'
import lotteryConfig from '../core/lottery-config'
import STATUS from '../core/lottery-status'
import { isRehearsal } from '../core/rehearsal'
import { downloadVerificationFile } from '../core/lottery-fairness'
import { resetBackupReminder } from '../core/backup-reminder'
import { toast } from './feedback'

vi.mock('../core/lottery-config', () => ({
  default: { seed: 7, prizeList: [] as { id: string; name: string; countRemain: number }[] },
}))
vi.mock('../core/rehearsal', () => ({ isRehearsal: vi.fn(() => false) }))
vi.mock('../core/lottery-fairness', () => ({ downloadVerificationFile: vi.fn() }))
vi.mock('./feedback', () => ({ toast: vi.fn() }))

// 模拟一轮抽完：动画阶段不提醒，演出结束（presenting）时检查。
function finishRound(update: () => void) {
  act(() => STATUS.setPhase('spinning'))
  update()
  act(() => STATUS.setPhase('revealing'))
  act(() => STATUS.setPhase('presenting'))
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  resetBackupReminder()
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(downloadVerificationFile).mockResolvedValue()
  act(() => STATUS.setPhase('idle'))
  lotteryConfig.seed = 7
  lotteryConfig.prizeList = [
    { id: 'p1', name: '一等奖', countRemain: 1 },
    { id: 'p2', name: '二等奖', countRemain: 2 },
  ] as typeof lotteryConfig.prizeList
})

const prize = (id: string) => lotteryConfig.prizeList.find(p => p.id === id)!

describe('奖项抽完提醒', () => {
  it('抽完时显示一次，下载后收起；动画进行中不显示', async () => {
    render(<LotteryBackupReminder controlConnected={false} />)
    act(() => STATUS.setPhase('spinning'))
    prize('p1').countRemain = 0
    act(() => STATUS.setPhase('revealing'))
    expect(screen.queryByRole('status')).toBeNull()
    act(() => STATUS.setPhase('presenting'))
    expect(screen.getByRole('status').textContent).toContain('「一等奖」已抽完')
    expect(screen.getByRole('status').textContent).toContain('文件含种子，活动结束前请自己保管')
    fireEvent.click(screen.getByRole('button', { name: '下载验证文件' }))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(downloadVerificationFile).toHaveBeenCalledTimes(1)
    finishRound(() => {})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('下载失败时提示并保留卡片', async () => {
    vi.mocked(downloadVerificationFile).mockRejectedValue(new Error('x'))
    render(<LotteryBackupReminder controlConnected={false} />)
    finishRound(() => { prize('p1').countRemain = 0 })
    fireEvent.click(screen.getByRole('button', { name: '下载验证文件' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('验证文件生成失败，请稍后重试'))
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('忽略只收起这一次，下一个奖项抽完还会提醒；“本场不再提醒”之后不再出现', () => {
    lotteryConfig.prizeList = [...lotteryConfig.prizeList, { id: 'p3', name: '三等奖', countRemain: 1 }] as typeof lotteryConfig.prizeList
    render(<LotteryBackupReminder controlConnected={false} />)
    finishRound(() => { prize('p1').countRemain = 0 })
    fireEvent.click(screen.getByRole('button', { name: '忽略' }))
    expect(screen.queryByRole('status')).toBeNull()
    finishRound(() => { prize('p2').countRemain = 0 })
    expect(screen.getByRole('status').textContent).toContain('「二等奖」已抽完')
    fireEvent.click(screen.getByRole('button', { name: '本场不再提醒' }))
    finishRound(() => { prize('p3').countRemain = 0 })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('启动时已抽完的奖项不提醒', () => {
    prize('p1').countRemain = 0
    render(<LotteryBackupReminder controlConnected={false} />)
    finishRound(() => {})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('彩排和双屏控制中不显示', () => {
    vi.mocked(isRehearsal).mockReturnValue(true)
    const { rerender } = render(<LotteryBackupReminder controlConnected={false} />)
    finishRound(() => { prize('p1').countRemain = 0 })
    expect(screen.queryByRole('status')).toBeNull()
    vi.mocked(isRehearsal).mockReturnValue(false)
    rerender(<LotteryBackupReminder controlConnected />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<LotteryBackupReminder controlConnected={false} />)
    expect(screen.getByRole('status').textContent).toContain('「一等奖」已抽完')
  })
})
