import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LotteryAttestation from './LotteryAttestation'
import { buildAttestation } from '../core/attestation'
import type { AttestationInput } from '../core/attestation'

afterEach(cleanup)

const input: AttestationInput = {
  title: '年会',
  seedCommit: 'ab'.repeat(32),
  seedSalt: 'c'.repeat(64),
  rosterCount: 10,
  prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
  drawLog: [],
  rehearsal: false,
  now: new Date(2026, 10, 13, 8, 0, 0),
}

describe('公证卡浮层', () => {
  it('两行各 4 组指纹、短码和核对方法；未抽时没有红字', () => {
    render(<LotteryAttestation card={buildAttestation(input)!} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '开抽前公证卡' })
    const rows = dialog.querySelectorAll('.attestation-fingerprint .fp-row')
    expect([...rows].map(row => row.querySelectorAll('.fp-group').length)).toEqual([4, 4])
    expect(dialog.querySelector('.attestation-short strong')?.textContent).toBe('abababab')
    expect(dialog.textContent).toContain('核对方法')
    expect(dialog.querySelector('.attestation-stage.drawn')).toBeNull()
  })

  it('打开期间给根节点打打印标记，关闭后移除；打印和关闭按钮可用', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const onClose = vi.fn()
    const { unmount } = render(<LotteryAttestation card={buildAttestation(input)!} onClose={onClose} />)
    expect(document.documentElement.classList.contains('attestation-open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '打印' }))
    expect(print).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(document.documentElement.classList.contains('attestation-open')).toBe(false)
    print.mockRestore()
  })
})
