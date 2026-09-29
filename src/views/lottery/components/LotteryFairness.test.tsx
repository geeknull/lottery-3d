import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LotteryFairness from './LotteryFairness'
import lotteryConfig from '../core/lottery-config'
import { ensureSeedCommit, verifyCurrent } from '../core/lottery-fairness'
import { verifyVerificationPackage } from '../core/fairness-package'
import type { VerifyResult } from '../core/fairness-package'
import { notifyLotteryChange } from '../core/lottery-store'

vi.mock('../core/lottery-config', () => ({ default: { seed: 7, seedCommit: '', drawLog: [] } }))
vi.mock('../core/lottery-fairness', () => ({
  ensureSeedCommit: vi.fn(), verifyCurrent: vi.fn(), createVerificationPackage: vi.fn(),
}))
vi.mock('../core/fairness-package', () => ({ verifyVerificationPackage: vi.fn() }))
vi.mock('./feedback', () => ({ toast: vi.fn() }))

const success: VerifyResult = { ok: true, checkedDraws: 1, failedAt: null }

afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
  lotteryConfig.seedCommit = ''
  vi.mocked(ensureSeedCommit).mockResolvedValue()
  vi.mocked(verifyCurrent).mockResolvedValue(success)
  vi.mocked(verifyVerificationPackage).mockResolvedValue(success)
})

describe('公平性验证的异步结果', () => {
  it('等待首次承诺生成并通知版本变化后，仍显示本次自验证结果', async () => {
    const commit = Promise.withResolvers<void>()
    vi.mocked(ensureSeedCommit).mockReturnValue(commit.promise)
    render(<LotteryFairness onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '立即自验证' }))
    expect(verifyCurrent).not.toHaveBeenCalled()

    await act(async () => {
      lotteryConfig.seedCommit = '12345678'
      notifyLotteryChange()
      commit.resolve()
      await commit.promise
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('当前场次验证通过'))
  })

  it('独立文件验证不受当前场次初始化或后续抽奖版本变化影响', async () => {
    const verification = Promise.withResolvers<VerifyResult>()
    vi.mocked(verifyVerificationPackage).mockReturnValue(verification.promise)
    const { container } = render(<LotteryFairness onClose={() => {}} />)
    const file = new File(['{}'], 'verification.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => '{}' })
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
    await waitFor(() => expect(verifyVerificationPackage).toHaveBeenCalled())

    await act(async () => {
      notifyLotteryChange()
      verification.resolve(success)
      await verification.promise
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('导入文件验证通过'))
    await act(async () => { notifyLotteryChange() })
    expect(screen.getByRole('status').textContent).toContain('导入文件验证通过')
  })

  it('自验证尚未完成时本场发生新操作，不显示旧快照的验证结果', async () => {
    const verification = Promise.withResolvers<VerifyResult>()
    vi.mocked(verifyCurrent).mockReturnValue(verification.promise)
    render(<LotteryFairness onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '立即自验证' }))
    await waitFor(() => expect(verifyCurrent).toHaveBeenCalled())
    await act(async () => {
      notifyLotteryChange()
      verification.resolve(success)
      await verification.promise
    })
    expect(screen.queryByRole('status')).toBeNull()
  })
})
