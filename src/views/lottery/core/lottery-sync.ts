import type { StateSnapshot } from './lottery-snapshot'

// 双屏通信层：同源两窗口通过 BroadcastChannel 通信。
// 展示窗（执行端）发状态+心跳、收命令；控制窗（遥控器）发命令、收状态+心跳并判在线。

export const SYNC_CHANNEL = 'lottery-3d-sync'
const HEARTBEAT_MS = 3000 // 展示窗心跳间隔
const OFFLINE_MS = 8000 // 控制窗超过此时长没收到任何消息即判定展示窗离线

export type SyncCommand =
  | { action: 'selectPrize'; prizeId: string }
  | { action: 'start' }
  | { action: 'stop' }
  | { action: 'requestState' } // 控制窗握手：请展示窗立即回发当前状态

export type SyncMessage =
  | { kind: 'command'; command: SyncCommand }
  | { kind: 'state'; snapshot: StateSnapshot }
  | { kind: 'heartbeat' }

// 频道抽象，便于测试注入 mock（真实实现见 broadcastChannel）
export interface Channel {
  post(msg: SyncMessage): void
  setHandler(cb: (msg: SyncMessage) => void): void
  close(): void
}

export function broadcastChannel(name = SYNC_CHANNEL): Channel {
  const bc = new BroadcastChannel(name)
  return {
    post: msg => bc.postMessage(msg),
    setHandler: cb => { bc.onmessage = e => cb(e.data as SyncMessage) },
    close: () => bc.close(),
  }
}

// 双向在线监测内核：两端共用。各自定时发心跳，并把"近期收到过对端任何消息"
// 视为对端在线、超过 OFFLINE_MS 无消息视为离线。BroadcastChannel 不回弹自己发的消息，
// 所以一端收到的消息必来自对端，无需区分发送方。
function attachPresence(
  channel: Channel,
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
    onMessage(msg)
    lastSeen = now()
    setConnected(true)
  })
  const beat = setInterval(() => channel.post({ kind: 'heartbeat' }), HEARTBEAT_MS)
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
  now: () => number = () => Date.now(),
): DisplaySync {
  const stop = attachPresence(channel, now, handlers.onConnectionChange, msg => {
    if (msg.kind === 'command') {
      handlers.onCommand(msg.command)
    }
  })
  return {
    postState: snapshot => channel.post({ kind: 'state', snapshot }),
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
  now: () => number = () => Date.now(),
): ControlSync {
  const stop = attachPresence(channel, now, handlers.onConnectionChange, msg => {
    if (msg.kind === 'state') {
      handlers.onState(msg.snapshot)
    }
  })
  // 握手：请展示窗立即回发当前状态（否则要等下次状态变化或心跳）
  channel.post({ kind: 'command', command: { action: 'requestState' } })
  return {
    send: cmd => channel.post({ kind: 'command', command: cmd }),
    close: () => {
      stop()
      channel.close()
    },
  }
}
