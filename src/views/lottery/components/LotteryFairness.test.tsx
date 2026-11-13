import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LotteryFairness from './LotteryFairness'
import lotteryConfig from '../core/lottery-config'
import { ensureSeedCommit, verifyCurrent } from '../core/lottery-fairness'
import { verifyVerificationPackage } from '../core/fairness-package'
import type { VerifyResult } from '../core/fairness-package'
import { notifyLotteryChange } from '../core/lottery-store'
import STATUS from '../core/lottery-status'
import { isRehearsal } from '../core/rehearsal'
import { resetAttestationReminder, wasAttestationShown } from '../core/attestation-reminder'

vi.mock('../core/lottery-config', () => ({
  default: {
    seed: 7, seedCommit: '', seedSalt: '', drawLog: [], headerTitle: '年会', cardList: [{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }],
    prizeList: [{ id: 'p1', name: '一等奖', count: 2, everyTimeGet: 1 }],
  },
}))
vi.mock('../core/rehearsal', () => ({ isRehearsal: vi.fn(() => false) }))
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
  lotteryConfig.seedSalt = ''
  lotteryConfig.drawLog = []
  resetAttestationReminder()
  act(() => STATUS.setPhase('idle'))
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

const commit = '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809'
const salt = 'e'.repeat(64)
const cardButton = () => screen.getByRole('button', { name: '公证卡' }) as HTMLButtonElement

describe('公证卡入口', () => {
  it('加盐指纹且空闲时可打开，卡片分组与面板指纹一致，不显示种子和姓名', () => {
    lotteryConfig.seedCommit = commit
    lotteryConfig.seedSalt = salt
    render(<LotteryFairness onClose={() => {}} />)
    expect(cardButton().disabled).toBe(false)
    fireEvent.click(cardButton())
    const dialog = screen.getByRole('dialog', { name: '开抽前公证卡' })
    const groups = [...dialog.querySelectorAll('.fp-group')].map(el => el.textContent)
    expect(groups).toHaveLength(8)
    expect(groups.join('')).toBe(commit)
    expect(dialog.textContent).toContain('年会 开抽前公证卡')
    expect(dialog.textContent).toContain('开抽前')
    expect(dialog.textContent).toContain('名单 2 人')
    expect(dialog.textContent).toContain('一等奖 × 2（每轮 1 人）')
    expect(dialog.textContent).toContain('本机时间，不能作为公布时间的证明')
    expect(dialog.textContent).not.toContain(salt)
    expect(dialog.textContent).not.toContain('张三')
    expect(dialog.querySelector('.attestation-watermark')).toBeNull()
    expect(wasAttestationShown()).toBe(true)
  })

  it('抽奖进行中按钮不可用，打开后进入抽奖会自动收起卡片', () => {
    lotteryConfig.seedCommit = commit
    lotteryConfig.seedSalt = salt
    act(() => STATUS.setPhase('spinning'))
    render(<LotteryFairness onClose={() => {}} />)
    expect(cardButton().disabled).toBe(true)
    expect(screen.getByText('抽奖进行中，结束后再打开公证卡')).toBeTruthy()

    act(() => STATUS.setPhase('presenting'))
    expect(cardButton().disabled).toBe(false)
    fireEvent.click(cardButton())
    expect(screen.queryByRole('dialog')).not.toBeNull()
    act(() => STATUS.setPhase('preparing'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('8 位 FNV 指纹不出卡，按钮置灰并说明原因', () => {
    lotteryConfig.seedCommit = '1a2b3c4d'
    render(<LotteryFairness onClose={() => {}} />)
    expect(cardButton().disabled).toBe(true)
    expect(screen.getByText('此环境只有非加密的 8 位指纹，请用 HTTPS 或 localhost 打开')).toBeTruthy()
    expect(wasAttestationShown()).toBe(false)
  })

  it('旧存档无盐指纹出卡并显示限制标签', () => {
    lotteryConfig.seedCommit = commit
    render(<LotteryFairness onClose={() => {}} />)
    fireEvent.click(cardButton())
    expect(screen.getByRole('dialog').textContent).toContain('仅绑定种子，不绑定名单和奖项规则')
  })

  it('已有抽奖记录时卡片顶部和页脚都显示红字', () => {
    lotteryConfig.seedCommit = commit
    lotteryConfig.seedSalt = salt
    lotteryConfig.drawLog = [{ type: 'draw' }, { type: 'draw' }, { type: 'undo' }] as typeof lotteryConfig.drawLog
    render(<LotteryFairness onClose={() => {}} />)
    fireEvent.click(cardButton())
    const labels = [...screen.getByRole('dialog').querySelectorAll('.attestation-stage.drawn')].map(el => el.textContent)
    expect(labels).toEqual(['本场已抽 2 轮，此卡不是开抽前凭证', '本场已抽 2 轮，此卡不是开抽前凭证'])
  })

  it('彩排卡片带“彩排，不具效力”水印', () => {
    lotteryConfig.seedCommit = commit
    lotteryConfig.seedSalt = salt
    vi.mocked(isRehearsal).mockReturnValue(true)
    render(<LotteryFairness onClose={() => {}} />)
    fireEvent.click(cardButton())
    expect(screen.getByRole('dialog').querySelector('.attestation-watermark')?.textContent).toBe('彩排，不具效力')
  })

  it('卡片打开时 Escape 只关卡片，再按一次才关面板', () => {
    lotteryConfig.seedCommit = commit
    lotteryConfig.seedSalt = salt
    const onClose = vi.fn()
    render(<LotteryFairness onClose={onClose} />)
    fireEvent.click(cardButton())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
