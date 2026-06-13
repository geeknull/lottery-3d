import { useEffect, useState, useRef } from 'react'
import { broadcastChannel, createControlSync } from '../core/lottery-sync'
import type { ControlSync, SyncCommand } from '../core/lottery-sync'
import type { StateSnapshot } from '../core/lottery-snapshot'
import './lottery-control.scss'

// 控制窗（遥控器）：不跑抽奖逻辑，只渲染展示窗广播来的状态快照、把操作转成命令发回。
export default function LotteryControl() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const syncRef = useRef<ControlSync | null>(null)

  useEffect(() => {
    const sync = createControlSync(broadcastChannel(), {
      onState: setSnapshot,
      onConnectionChange: setConnected,
    })
    syncRef.current = sync
    return () => sync.close()
  }, [])

  const send = (cmd: SyncCommand) => syncRef.current?.send(cmd)

  if (!snapshot) {
    return (
      <div className="lottery-control">
        <div className="control-waiting">
          <div className="control-spinner" />
          <p>{connected ? '已连接，正在获取状态…' : '等待连接展示窗…'}</p>
          <p className="control-hint">在展示窗点击右上角「双屏」按钮，或确认展示窗已打开同一地址。</p>
        </div>
      </div>
    )
  }

  const { headerTitle, prizes, currentPrizeId, spinning, lastReveal } = snapshot

  return (
    <div className="lottery-control">
      <header className="control-header">
        <span className="control-title">{headerTitle}</span>
        <span className={'control-conn ' + (connected ? 'on' : 'off')}>
          {connected ? '● 已连接' : '○ 已断开'}
        </span>
      </header>

      <div className="control-prizes">
        {prizes.map(p => (
          <button
            key={p.id}
            className={'control-prize' + (p.id === currentPrizeId ? ' selected' : '')}
            disabled={!connected || spinning}
            onClick={() => send({ action: 'selectPrize', prizeId: p.id })}
          >
            <span className="cp-name">{p.name}</span>
            <span className="cp-remain">{p.countRemain}/{p.count}</span>
          </button>
        ))}
      </div>

      <button
        className={'control-cta' + (spinning ? ' is-spinning' : '')}
        disabled={!connected}
        onClick={() => send({ action: spinning ? 'stop' : 'start' })}
      >
        {spinning ? '停 !' : '开始抽奖'}
      </button>

      {lastReveal && (
        <div className="control-reveal">
          <div className="cr-title">最近中奖 · {lastReveal.prizeName}</div>
          <div className="cr-names">{lastReveal.winnerNames.join('、') || '—'}</div>
        </div>
      )}

      {!connected && <div className="control-offline-tip">展示窗已断开，操作暂不可用</div>}
    </div>
  )
}
