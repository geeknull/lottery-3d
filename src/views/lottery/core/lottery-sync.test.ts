import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDisplaySync, createControlSync, isDualScreenSupported } from './lottery-sync'
import type { Channel, SyncMessage } from './lottery-sync'
import type { StateSnapshot } from './lottery-snapshot'

describe('isDualScreenSupported', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('BroadcastChannel 存在时为 true', () => {
    expect(isDualScreenSupported()).toBe(true)
  })
  it('BroadcastChannel 不存在（老 Safari）时为 false', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(isDualScreenSupported()).toBe(false)
  })
})

// 一对互通的 mock 频道：a.post 的消息进 b 的 handler，反之亦然（模拟两个窗口）
function channelPair(): [Channel, Channel] {
  let ha: ((m: SyncMessage) => void) | null = null
  let hb: ((m: SyncMessage) => void) | null = null
  const a: Channel = { post: m => hb?.(m), setHandler: cb => { ha = cb }, close: () => {} }
  const b: Channel = { post: m => ha?.(m), setHandler: cb => { hb = cb }, close: () => {} }
  return [a, b]
}

const snap: StateSnapshot = {
  headerTitle: '幸运大抽奖', prizes: [], currentPrizeId: null, spinning: false, lastReveal: null,
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function display(ch: Channel, onCommand = vi.fn(), onConnectionChange = vi.fn()) {
  return createDisplaySync(ch, { onCommand, onConnectionChange })
}

describe('控制窗 → 展示窗 命令', () => {
  it('控制窗 send 命令，展示窗 onCommand 收到', () => {
    const [disp, ctrl] = channelPair()
    const onCommand = vi.fn()
    display(disp, onCommand)
    const control = createControlSync(ctrl, { onState: vi.fn(), onConnectionChange: vi.fn() })
    control.send({ action: 'start' })
    expect(onCommand).toHaveBeenCalledWith({ action: 'start' })
  })

  it('控制窗创建即发 requestState 握手', () => {
    const [disp, ctrl] = channelPair()
    const onCommand = vi.fn()
    display(disp, onCommand)
    createControlSync(ctrl, { onState: vi.fn(), onConnectionChange: vi.fn() })
    expect(onCommand).toHaveBeenCalledWith({ action: 'requestState' })
  })
})

describe('展示窗 → 控制窗 状态', () => {
  it('展示窗 postState，控制窗 onState 收到快照', () => {
    const [disp, ctrl] = channelPair()
    const d = display(disp)
    const onState = vi.fn()
    createControlSync(ctrl, { onState, onConnectionChange: vi.fn() })
    d.postState(snap)
    expect(onState).toHaveBeenCalledWith(snap)
  })
})

describe('展示窗感知控制窗在线（用于自动隐藏 UI）', () => {
  it('控制窗握手/心跳后展示窗判定控制窗已连接', () => {
    const [disp, ctrl] = channelPair()
    const onConn = vi.fn()
    display(disp, vi.fn(), onConn)
    createControlSync(ctrl, { onState: vi.fn(), onConnectionChange: vi.fn() })
    expect(onConn).toHaveBeenLastCalledWith(true) // 控制窗创建即发 requestState，展示窗立刻感知
  })

  it('控制窗关闭后展示窗超时判定断开', () => {
    const [disp, ctrl] = channelPair()
    const onConn = vi.fn()
    display(disp, vi.fn(), onConn)
    const control = createControlSync(ctrl, { onState: vi.fn(), onConnectionChange: vi.fn() })
    expect(onConn).toHaveBeenLastCalledWith(true)
    control.close()
    vi.advanceTimersByTime(9000)
    expect(onConn).toHaveBeenLastCalledWith(false)
  })
})

describe('连接状态', () => {
  it('收到展示窗心跳后判定为已连接', () => {
    const [disp, ctrl] = channelPair()
    const d = display(disp)
    const onConnectionChange = vi.fn()
    createControlSync(ctrl, { onState: vi.fn(), onConnectionChange })
    vi.advanceTimersByTime(3000) // 展示窗发出第一次心跳
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
    void d
  })

  it('展示窗停止后超时判定为断开', () => {
    const [disp, ctrl] = channelPair()
    const d = display(disp)
    const onConnectionChange = vi.fn()
    createControlSync(ctrl, { onState: vi.fn(), onConnectionChange })
    vi.advanceTimersByTime(3000) // 连接建立
    expect(onConnectionChange).toHaveBeenLastCalledWith(true)
    d.close() // 展示窗关闭，不再发心跳
    vi.advanceTimersByTime(9000) // 超过 OFFLINE_MS(8s) 无消息
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)
  })

  it('持续心跳期间保持连接，不反复触发', () => {
    const [disp, ctrl] = channelPair()
    display(disp)
    const onConnectionChange = vi.fn()
    createControlSync(ctrl, { onState: vi.fn(), onConnectionChange })
    vi.advanceTimersByTime(3000)
    vi.advanceTimersByTime(3000)
    vi.advanceTimersByTime(3000)
    expect(onConnectionChange).toHaveBeenCalledTimes(1) // 只在首次连上触发一次
  })
})
