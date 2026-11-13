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
import { planProgressRestore } from '../core/progress-restore'
import { appConfirm, toast } from './feedback'
import type { DrawLogEntry } from '../core/lottery-types'

vi.mock('../core/lottery-config', () => ({
  default: {
    seed: 7, seedCommit: '', seedSalt: '', drawLog: [], headerTitle: '年会', cardList: [{ id: 'a', name: '张三' }, { id: 'b', name: '李四' }],
    prizeList: [{ id: 'p1', name: '一等奖', count: 2, everyTimeGet: 1 }],
    cardListWinAll: [], replaceProgress: vi.fn(),
  },
}))
vi.mock('../core/rehearsal', () => ({ isRehearsal: vi.fn(() => false) }))
vi.mock('../core/lottery-fairness', () => ({
  ensureSeedCommit: vi.fn(), verifyCurrent: vi.fn(), createVerificationPackage: vi.fn(), downloadVerificationFile: vi.fn(),
}))
vi.mock('../core/fairness-package', () => ({ verifyVerificationPackage: vi.fn() }))
vi.mock('./feedback', () => ({ toast: vi.fn(), appConfirm: vi.fn() }))
vi.mock('../core/progress-restore', async importOriginal => ({
  ...await importOriginal<typeof import('../core/progress-restore')>(),
  planProgressRestore: vi.fn(),
}))

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

describe('当前种子默认隐藏', () => {
  it('打开面板不显示种子，点“显示种子”才显示，再点隐藏', () => {
    lotteryConfig.seed = 3141592653
    render(<LotteryFairness onClose={() => {}} />)
    const panel = document.querySelector('.lottery-fairness')!
    expect(panel.textContent).not.toContain('3141592653')
    expect(panel.querySelector('.seed-hidden')?.textContent).toBe('已隐藏')
    fireEvent.click(screen.getByRole('button', { name: '显示种子' }))
    expect(panel.querySelector('.seed-value')?.textContent).toBe('3141592653')
    expect(screen.getByRole('note').textContent).toContain('种子正在显示')
    fireEvent.click(screen.getByRole('button', { name: '隐藏种子' }))
    expect(panel.textContent).not.toContain('3141592653')
  })

  it('醒目的风险提示、导出提示和“无法证明公布时间”的说明都在', () => {
    render(<LotteryFairness onClose={() => {}} />)
    expect(screen.getByRole('note').textContent).toContain('种子公开后，本场后续每一轮结果都可以被算出来')
    expect(screen.getByText('验证数据含种子，活动结束后再分享')).toBeTruthy()
    expect(document.querySelector('.fairness-intro')?.textContent).toContain('本地验证无法证明公布时间')
    expect(document.querySelector('.lottery-fairness')?.textContent).toContain('已记录 0 轮抽奖')
  })
})

describe('导入验证文件后核对指纹', () => {
  async function importPackage(container: HTMLElement, body: unknown) {
    const file = new File(['x'], 'verification.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(body) })
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('导入文件'))
  }

  it('显示文件中的分组指纹，核对输入忽略空格和大小写，不一致时指出第一个不同分组', async () => {
    const { container } = render(<LotteryFairness onClose={() => {}} />)
    await importPackage(container, { seedCommit: commit })
    const groups = [...container.querySelectorAll('.file-fingerprint .fp-group')].map(el => el.textContent)
    expect(groups.join('')).toBe(commit)
    expect(groups).toHaveLength(8)

    const input = screen.getByLabelText('核对卡片指纹')
    fireEvent.change(input, { target: { value: commit.toUpperCase().replace(/(.{8})/g, '$1 ') } })
    expect(container.querySelector('.fingerprint-check-result')?.textContent).toBe('✓ 与验证文件一致')
    fireEvent.change(input, { target: { value: commit.slice(0, 20) + '0000' + commit.slice(24) } })
    expect(container.querySelector('.fingerprint-check-result')?.textContent).toBe('✗ 不一致：第 3 组开始不同')

    // 重新导入清空上一次的输入
    await importPackage(container, { seedCommit: commit })
    await waitFor(() => expect((screen.getByLabelText('核对卡片指纹') as HTMLInputElement).value).toBe(''))
  })

  it('文件里没有有效指纹时不显示核对区；当前场次自验证也不显示', async () => {
    const { container } = render(<LotteryFairness onClose={() => {}} />)
    await importPackage(container, { seedCommit: 'not-hex' })
    expect(container.querySelector('.fingerprint-check')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '立即自验证' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('当前场次验证通过'))
    expect(container.querySelector('.fingerprint-check')).toBeNull()
  })
})

describe('从验证文件恢复进度', () => {
  const draw = (prizeId = 'p1', undone = false): DrawLogEntry => ({ type: 'draw', at: 1, prizeId, prizeName: '一等奖', winnerIds: ['a'], winnerNames: ['张三'], ...(undone ? { undone } : {}) })
  const saved = { version: 2 as const, cardListWinAll: ['a', 'b'], cardListRemainAll: [], drawLog: [draw(), draw()] }
  const okPlan = { ok: true as const, saved, summary: { rounds: 2, winners: 2, entries: 2 } }

  function pickRestoreFile(container: HTMLElement, text = '{"format":"lottery-3d-verification"}') {
    const file = new File([text], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    fireEvent.change(container.querySelector('.restore-input')!, { target: { files: [file] } })
  }

  beforeEach(() => {
    lotteryConfig.cardListWinAll = []
    vi.mocked(planProgressRestore).mockResolvedValue(okPlan)
    vi.mocked(appConfirm).mockResolvedValue(true)
    vi.mocked(lotteryConfig.replaceProgress).mockReturnValue({ ok: true })
  })

  it('彩排、双屏控制中、抽奖演出中时禁用并说明原因，展示中奖时可用', () => {
    const button = () => screen.getByRole('button', { name: '从验证文件恢复进度' }) as HTMLButtonElement
    vi.mocked(isRehearsal).mockReturnValue(true)
    const { rerender } = render(<LotteryFairness onClose={() => {}} />)
    expect(button().disabled).toBe(true)
    expect(screen.getByText('彩排不读写正式进度，请在正式舞台恢复')).toBeTruthy()
    vi.mocked(isRehearsal).mockReturnValue(false)
    rerender(<LotteryFairness onClose={() => {}} controlConnected />)
    expect(button().disabled).toBe(true)
    expect(screen.getByText('双屏控制中，请先退出双屏控制再恢复')).toBeTruthy()
    rerender(<LotteryFairness onClose={() => {}} />)
    expect(button().disabled).toBe(false)
    act(() => STATUS.setPhase('presenting')) // 本轮结果已落盘、等待主持人操作，可以恢复
    expect(button().disabled).toBe(false)
    act(() => STATUS.setPhase('revealing'))
    expect(button().disabled).toBe(true)
    expect(screen.getByText('抽奖进行中，结束后再恢复')).toBeTruthy()
  })

  it('不是 JSON 时直接提示，不做检查', async () => {
    const { container } = render(<LotteryFairness onClose={() => {}} />)
    pickRestoreFile(container, 'not json')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没有恢复：文件不是有效的 JSON'))
    expect(planProgressRestore).not.toHaveBeenCalled()
  })

  it('检查不通过时显示原因，不弹确认、不写入', async () => {
    vi.mocked(planProgressRestore).mockResolvedValue({ ok: false, reason: '备份里的名单和当前名单不一致（人数不同）' })
    const { container } = render(<LotteryFairness onClose={() => {}} />)
    pickRestoreFile(container)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没有恢复：备份里的名单和当前名单不一致（人数不同）'))
    expect(planProgressRestore).toHaveBeenCalledWith({ format: 'lottery-3d-verification' }, lotteryConfig)
    expect(appConfirm).not.toHaveBeenCalled()
    expect(lotteryConfig.replaceProgress).not.toHaveBeenCalled()
  })

  it('空场次：普通确认，显示标题和两边概况，确认后写入并刷新', async () => {
    const onRestored = vi.fn()
    const { container } = render(<LotteryFairness onClose={() => {}} onRestored={onRestored} />)
    pickRestoreFile(container)
    await waitFor(() => expect(onRestored).toHaveBeenCalled())
    const [message, options] = vi.mocked(appConfirm).mock.calls[0]
    expect(message).toContain('「年会」')
    expect(message).toContain('备份：2 轮、2 人中奖（2 条操作记录）')
    expect(message).toContain('当前：0 轮、0 人中奖（0 条操作记录）')
    expect(options).toEqual({ confirmText: '恢复并刷新', warning: undefined })
    expect(lotteryConfig.replaceProgress).toHaveBeenCalledWith(saved)
  })

  it('已有进度且备份更旧：红字写明替换和丢失的轮数，按钮是“替换当前进度并刷新”', async () => {
    lotteryConfig.drawLog = [draw(), draw(), draw('p1', true), { ...draw(), type: 'undo' }, draw(), draw()]
    lotteryConfig.cardListWinAll = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] as typeof lotteryConfig.cardListWinAll
    const { container } = render(<LotteryFairness onClose={() => {}} onRestored={() => {}} />)
    pickRestoreFile(container)
    await waitFor(() => expect(lotteryConfig.replaceProgress).toHaveBeenCalled())
    const [, options] = vi.mocked(appConfirm).mock.calls[0]
    expect(options?.confirmText).toBe('替换当前进度并刷新')
    expect(options?.warning).toContain('当前场次已有 4 轮、4 人中奖（6 条操作记录），恢复后会被替换')
    expect(options?.warning).toContain('备份比当前场次少 2 轮，这 2 轮的结果会丢失')
  })

  it('取消或确认期间开始抽奖：不写入', async () => {
    vi.mocked(appConfirm).mockResolvedValueOnce(false)
    const { container } = render(<LotteryFairness onClose={() => {}} onRestored={() => {}} />)
    pickRestoreFile(container)
    await waitFor(() => expect(appConfirm).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByRole('button', { name: '从验证文件恢复进度' }) as HTMLButtonElement).disabled).toBe(false))
    expect(lotteryConfig.replaceProgress).not.toHaveBeenCalled()

    vi.mocked(appConfirm).mockImplementationOnce(async () => { act(() => STATUS.setPhase('spinning')); return true })
    pickRestoreFile(container)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没有恢复：抽奖进行中，结束后再恢复'))
    expect(lotteryConfig.replaceProgress).not.toHaveBeenCalled()
  })

  it('写入失败：提示原因，不刷新', async () => {
    vi.mocked(lotteryConfig.replaceProgress).mockReturnValue({ ok: false, reason: '当前进度无法留底（本地存储可能已满）' })
    const onRestored = vi.fn()
    const { container } = render(<LotteryFairness onClose={() => {}} onRestored={onRestored} />)
    pickRestoreFile(container)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('没有恢复：当前进度无法留底（本地存储可能已满）'))
    expect(toast).toHaveBeenCalledWith('⚠ 恢复失败：当前进度无法留底（本地存储可能已满）', 8000)
    expect(onRestored).not.toHaveBeenCalled()
  })
})
