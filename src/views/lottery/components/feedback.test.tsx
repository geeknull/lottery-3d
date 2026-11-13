import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import { FeedbackHost, toast, appConfirm } from './feedback'

afterEach(cleanup)

describe('toast', () => {
  it('显示消息', () => {
    render(<FeedbackHost />)
    act(() => toast('操作成功'))
    expect(screen.getByText('操作成功')).toBeTruthy()
  })

  it('到时间后自动消失', async () => {
    render(<FeedbackHost />)
    act(() => toast('很快消失', 50))
    expect(screen.getByText('很快消失')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('很快消失')).toBeNull(), { timeout: 1500 })
  })

  it('多条消息同时堆叠展示', () => {
    render(<FeedbackHost />)
    act(() => {
      toast('第一条')
      toast('第二条')
    })
    expect(screen.getByText('第一条')).toBeTruthy()
    expect(screen.getByText('第二条')).toBeTruthy()
  })
})

describe('appConfirm', () => {
  it('点「确定」resolve true 并关闭对话框', async () => {
    render(<FeedbackHost />)
    let result: Promise<boolean>
    act(() => { result = appConfirm('确定要重置吗？') })
    expect(screen.getByText('确定要重置吗？')).toBeTruthy()
    fireEvent.click(screen.getByText('确定'))
    await expect(result!).resolves.toBe(true)
    expect(screen.queryByText('确定要重置吗？')).toBeNull()
  })

  it('点「取消」resolve false', async () => {
    render(<FeedbackHost />)
    let result: Promise<boolean>
    act(() => { result = appConfirm('确定要重置吗？') })
    fireEvent.click(screen.getByText('取消'))
    await expect(result!).resolves.toBe(false)
  })

  it('支持自定义按钮文案', () => {
    render(<FeedbackHost />)
    act(() => { appConfirm('保存配置？', { confirmText: '保存并应用', cancelText: '再想想' }) })
    expect(screen.getByText('保存并应用')).toBeTruthy()
    expect(screen.getByText('再想想')).toBeTruthy()
    fireEvent.click(screen.getByText('再想想'))
  })
})

describe('appConfirm 红字提醒', () => {
  it('warning 以红字段落显示在正文下方，没有时不渲染', async () => {
    const { container } = render(<FeedbackHost />)
    let result: Promise<boolean>
    act(() => { result = appConfirm('正文', { warning: '会替换已有结果', confirmText: '替换' }) })
    expect(container.querySelector('.confirm-warning')?.textContent).toBe('会替换已有结果')
    fireEvent.click(screen.getByText('替换'))
    await expect(result!).resolves.toBe(true)
    act(() => { result = appConfirm('普通确认') })
    expect(container.querySelector('.confirm-warning')).toBeNull()
    fireEvent.click(screen.getByText('取消'))
    await expect(result!).resolves.toBe(false)
  })
})
