import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LotteryErrorBoundary from './LotteryErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LotteryErrorBoundary', () => {
  it('子组件正常时原样渲染', () => {
    render(<LotteryErrorBoundary><p>舞台</p></LotteryErrorBoundary>)
    expect(screen.getByText('舞台')).toBeTruthy()
  })

  it('子组件抛错时显示可刷新的错误页', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LotteryErrorBoundary><Boom /></LotteryErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('页面出错了')
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeTruthy()
  })
})
