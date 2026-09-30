import type { StateSnapshot } from './lottery-snapshot'
import type { LotteryCommand } from './lottery-commands'

// 双屏通信层：同源两窗口通过 BroadcastChannel 通信。
// 展示窗（执行端）发状态+心跳、收命令；控制窗（遥控器）发命令、收状态+心跳并判在线。

export const SYNC_CHANNEL = 'lottery-3d-sync'
const HEARTBEAT_MS = 3000 // 展示窗心跳间隔
const OFFLINE_MS = 8000 // 控制窗超过此时长没收到任何消息即判定展示窗离线

export type SyncCommand =
  | LotteryCommand
  | { action: 'requestState' } // 控制窗握手：请展示窗立即回发当前状态

type SyncPayload =
  | { kind: 'command'; command: SyncCommand }
  | { kind: 'state'; snapshot: StateSnapshot }
  | { kind: 'heartbeat' }

type SyncRole = 'display' | 'control'
export type SyncMessage = SyncPayload & { sessionId: string; senderRole: SyncRole }

// 频道抽象，便于测试注入 mock（真实实现见 broadcastChannel）
export interface Channel {
  post(msg: SyncMessage): void
  setHandler(cb: (msg: SyncMessage) => void): void
  close(): void
}

// 双屏依赖 BroadcastChannel（Safari 15.4+）。不支持时双屏按钮置灰、不创建频道。
export function isDualScreenSupported(): boolean {
  return typeof BroadcastChannel !== 'undefined'
}

// 持有展示窗打开的控制窗引用，供主屏「退出双屏」一键关闭副屏
let controlWindow: Window | null = null
// 每个展示页实例独立配对，避免复制标签页继承 sessionStorage 后共用控制频道。
function newSessionId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}
let displaySessionId = newSessionId()

export function getDisplaySessionId(): string {
  return displaySessionId
}

export function resetDisplaySessionId(): string {
  displaySessionId = newSessionId()
  return displaySessionId
}

export function getControlSessionId(): string | null {
  const session = new URLSearchParams(window.location.search).get('session')
  return session && /^[a-zA-Z0-9-]{12,120}$/.test(session) ? session : null
}

// 打开控制窗（副屏）。返回 false 表示当前浏览器不支持双屏。
export function openControlWindow(): boolean {
  if (!isDualScreenSupported()) {
    return false
  }
  const url = new URL(window.location.href)
  url.searchParams.set('mode', 'control')
  url.searchParams.set('session', displaySessionId)
  controlWindow = window.open(url.href, `lottery-control-${displaySessionId}`, 'width=460,height=760')
  return controlWindow !== null
}

// 主屏一键关闭副屏（控制窗）
export function closeControlWindow(): void {
  try {
    controlWindow?.close()
  } catch {
    /* 已关闭/不可访问，忽略 */
  }
  controlWindow = null
}

function isValidCommand(c: unknown): c is SyncCommand {
  if (typeof c !== 'object' || c === null) return false
  const cmd = c as Record<string, unknown>
  switch (cmd.action) {
    case 'start':
    case 'stop':
    case 'toggleDraw':
    case 'resetView':
    case 'table':
    case 'skipReveal':
    case 'replayReveal':
    case 'winnerOverview':
    case 'winnerNextGroup':
    case 'winnerPreviousGroup':
    case 'requestState':
      return true
    case 'selectPrize':
      return typeof cmd.prizeId === 'string'
    default:
      return false
  }
}

function isValidSnapshot(s: unknown): s is StateSnapshot {
  if (typeof s !== 'object' || s === null) return false
  const snap = s as Record<string, unknown>
  return (
    typeof snap.headerTitle === 'string' &&
    Array.isArray(snap.prizes) && // 控制窗会 prizes.map，非数组会白屏，这是最关键的一道
    (snap.currentPrizeId === null || typeof snap.currentPrizeId === 'string') &&
    typeof snap.spinning === 'boolean' &&
    (snap.phase === undefined || (typeof snap.phase === 'string' && ['init', 'idle', 'preparing', 'spinning', 'revealing', 'presenting', 'transitioning'].includes(snap.phase))) &&
    (snap.winnerGroupIndex === undefined || snap.winnerGroupIndex === null || (Number.isInteger(snap.winnerGroupIndex) && Number(snap.winnerGroupIndex) >= 0)) &&
    (snap.groupCount === undefined || (Number.isInteger(snap.groupCount) && Number(snap.groupCount) >= 0)) &&
    (snap.replayAvailable === undefined || typeof snap.replayAvailable === 'boolean')
  )
}

// 校验入站消息结构。BroadcastChannel 同源无跨源风险，但两端可能跑不同版本代码
// （线上重部署期间），字段不兼容的消息若直接下发会让镜像 UI 渲染时抛错白屏，非法即丢弃。
export function isValidSyncMessage(data: unknown): data is SyncMessage {
  if (typeof data !== 'object' || data === null) return false
  const msg = data as Record<string, unknown>
  if (typeof msg.sessionId !== 'string' || !msg.sessionId ||
      (msg.senderRole !== 'display' && msg.senderRole !== 'control')) return false
  switch (msg.kind) {
    case 'heartbeat':
      return true
    case 'command':
      return msg.senderRole === 'control' && isValidCommand(msg.command)
    case 'state':
      return msg.senderRole === 'display' && isValidSnapshot(msg.snapshot)
    default:
      return false
  }
}

export function broadcastChannel(sessionId: string): Channel {
  const bc = new BroadcastChannel(`${SYNC_CHANNEL}:${sessionId}`)
  return {
    post: msg => bc.postMessage(msg),
    setHandler: cb => { bc.onmessage = e => { if (isValidSyncMessage(e.data)) cb(e.data) } },
    close: () => bc.close(),
  }
}

// 仅同一会话的相反角色能够更新在线状态和触发业务操作。
function attachPresence(
  channel: Channel,
  sessionId: string,
  senderRole: SyncRole,
  now: () => number,
  onConnectionChange: (connected: boolean) => void,
  onMessage: (msg: SyncMessage) => void,
): () => void {
  let lastSeen = 0
  let connected = false
  const setConnected = (v: boolean) => {
    if (v !== connected) {
      connected = v
      onConnectionChange(v)
    }
  }
  channel.setHandler(msg => {
    if (!isValidSyncMessage(msg) || msg.sessionId !== sessionId || msg.senderRole === senderRole) return
    onMessage(msg)
    lastSeen = now()
    setConnected(true)
  })
  const beat = setInterval(() => channel.post({ kind: 'heartbeat', sessionId, senderRole }), HEARTBEAT_MS)
  const check = setInterval(() => {
    if (connected && now() - lastSeen > OFFLINE_MS) {
      setConnected(false)
    }
  }, HEARTBEAT_MS)
  return () => {
    clearInterval(beat)
    clearInterval(check)
  }
}

// ---- 展示窗（执行端） ----

export interface DisplaySync {
  postState(snapshot: StateSnapshot): void
  close(): void
}

export interface DisplayHandlers {
  onCommand(cmd: SyncCommand): void
  onConnectionChange(connected: boolean): void // 控制窗是否在线（用于自动隐藏操作 UI）
}

export function createDisplaySync(
  channel: Channel,
  handlers: DisplayHandlers,
  sessionId: string,
  now: () => number = () => Date.now(),
): DisplaySync {
  const stop = attachPresence(channel, sessionId, 'display', now, handlers.onConnectionChange, msg => {
    if (msg.kind === 'command') {
      handlers.onCommand(msg.command)
    }
  })
  return {
    postState: snapshot => channel.post({ kind: 'state', snapshot, sessionId, senderRole: 'display' }),
    close: () => {
      stop()
      channel.close()
    },
  }
}

// ---- 控制窗（遥控器） ----

export interface ControlSync {
  send(cmd: SyncCommand): void
  close(): void
}

export interface ControlHandlers {
  onState(snapshot: StateSnapshot): void
  onConnectionChange(connected: boolean): void // 展示窗是否在线
}

export function createControlSync(
  channel: Channel,
  handlers: ControlHandlers,
  sessionId: string,
  now: () => number = () => Date.now(),
): ControlSync {
  const stop = attachPresence(channel, sessionId, 'control', now, handlers.onConnectionChange, msg => {
    if (msg.kind === 'state') {
      handlers.onState(msg.snapshot)
    }
  })
  // 握手：请展示窗立即回发当前状态（否则要等下次状态变化或心跳）
  channel.post({ kind: 'command', command: { action: 'requestState' }, sessionId, senderRole: 'control' })
  return {
    send: cmd => channel.post({ kind: 'command', command: cmd, sessionId, senderRole: 'control' }),
    close: () => {
      stop()
      channel.close()
    },
  }
}
