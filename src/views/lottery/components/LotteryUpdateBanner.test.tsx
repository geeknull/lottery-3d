import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react'
import LotteryUpdateBanner from './LotteryUpdateBanner'
import { markNeedRefresh } from '../core/pwa-update'
import lotteryConfig from '../core/lottery-config'

afterEach(cleanup)

beforeEach(() => {
  lotteryConfig.cardListWinAll = [] // 空闲态：用鼓励版横幅，不影响详情逻辑
  vi.restoreAllMocks()
})

function mockReleaseNotes(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok,
    json: async () => body,
  })))
}

// 横幅只在「发现新版」后渲染，先触发 needRefresh
function renderBannerWithUpdate() {
  render(<LotteryUpdateBanner />)
  act(() => {
    markNeedRefresh()
  })
}

describe('LotteryUpdateBanner 更新详情', () => {
  it('notes 非空 → 展示更新内容', async () => {
    mockReleaseNotes({ notes: ['新功能一', '新功能二'] })
    renderBannerWithUpdate()
    fireEvent.click(screen.getByText(/看看更新了什么/))
    await waitFor(() => expect(screen.getByText('新功能一')).toBeTruthy())
    expect(screen.getByText('新功能二')).toBeTruthy()
  })

  it('notes 为空 → 显示「本次更新暂无说明」', async () => {
    mockReleaseNotes({ notes: [] })
    renderBannerWithUpdate()
    fireEvent.click(screen.getByText(/看看更新了什么/))
    await waitFor(() => expect(screen.getByText('本次更新暂无说明')).toBeTruthy())
  })

  it('拉取失败 → 显示「暂时拿不到更新内容」', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down')
    }))
    renderBannerWithUpdate()
    fireEvent.click(screen.getByText(/看看更新了什么/))
    await waitFor(() => expect(screen.getByText('暂时拿不到更新内容')).toBeTruthy())
  })

  it('HTTP 非 2xx → 显示「暂时拿不到更新内容」', async () => {
    mockReleaseNotes('<html>404</html>', false)
    renderBannerWithUpdate()
    fireEvent.click(screen.getByText(/看看更新了什么/))
    await waitFor(() => expect(screen.getByText('暂时拿不到更新内容')).toBeTruthy())
  })

  it('未点开详情前不发起请求', () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    renderBannerWithUpdate()
    expect(f).not.toHaveBeenCalled()
  })
})
