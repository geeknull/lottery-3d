import { useEffect, useState, useRef } from 'react'
import { broadcastChannel, createControlSync, getControlSessionId, isDualScreenSupported } from '../core/lottery-sync'
import type { ControlSync, SyncCommand } from '../core/lottery-sync'
import type { StateSnapshot } from '../core/lottery-snapshot'
import './lottery-control.scss'

// 控制窗（遥控器）：不跑抽奖逻辑，只渲染展示窗广播来的状态快照、把操作转成命令发回。
export default function LotteryControl() {
  const [snapshot, setSnapshot] = useState<StateSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const syncRef = useRef<ControlSync | null>(null)

  useEffect(() => {
    const sessionId = getControlSessionId()
    if (!sessionId || !isDualScreenSupported()) return
    const sync = createControlSync(broadcastChannel(sessionId), {
      onState: setSnapshot,
      onConnectionChange: setConnected,
    }, sessionId)
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
          <p className="control-hint">请从展示窗右上角「双屏控制」打开控制窗。展示窗刷新后，请重新打开控制窗配对。</p>
        </div>
      </div>
    )
  }

  const { headerTitle, prizes, currentPrizeId, spinning, lastReveal, phase, winnerGroupIndex, groupCount = 0, replayAvailable } = snapshot
  const busy = phase ? !['idle', 'presenting', 'spinning'].includes(phase) : false
  const canPresent = phase === 'presenting'

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
            disabled={!connected || spinning || busy}
            onClick={() => send({ action: 'selectPrize', prizeId: p.id })}
          >
            <span className="cp-name">{p.name}</span>
            <span className="cp-counts">
              <span className="cp-drawn">已抽 {p.count - p.countRemain}/{p.count}</span>
              <span className="cp-remain">剩余 {p.countRemain}</span>
            </span>
          </button>
        ))}
      </div>

      <button
        className={'control-cta' + (spinning ? ' is-spinning' : '')}
        disabled={!connected || busy}
        onClick={() => send({ action: spinning ? 'stop' : 'start' })}
      >
        {spinning ? '停 !' : phase === 'preparing' ? '准备中…' : phase === 'revealing' ? '揭晓中…' : busy ? '调整中…' : '开始抽奖'}
      </button>

      <div className="control-presentation">
        {phase === 'revealing' && <button disabled={!connected} onClick={() => send({ action: 'skipReveal' })}>跳过动画，直接定格</button>}
        {replayAvailable && !busy && !spinning && <button disabled={!connected} onClick={() => send({ action: 'replayReveal' })}>重放揭晓</button>}
        {canPresent && groupCount > 1 && <>
          <button disabled={!connected} onClick={() => send({ action: 'winnerOverview' })}>中奖总览</button>
          <button disabled={!connected || winnerGroupIndex == null || winnerGroupIndex === 0} onClick={() => send({ action: 'winnerPreviousGroup' })}>上一组</button>
          <span>{winnerGroupIndex == null ? `全部 · ${groupCount} 组` : `${winnerGroupIndex + 1} / ${groupCount} 组`}</span>
          <button disabled={!connected || winnerGroupIndex === groupCount - 1} onClick={() => send({ action: 'winnerNextGroup' })}>{winnerGroupIndex == null ? '分组近景' : '下一组'}</button>
        </>}
        {!spinning && !busy && <button disabled={!connected} onClick={() => send({ action: 'resetView' })}>视角复位</button>}
      </div>

      {lastReveal && (
        <div className="control-reveal">
          <div className="cr-title">最近中奖 · {lastReveal.prizeName}</div>
          <div className="cr-names">{lastReveal.winnerNames.join('、') || '—'}</div>
        </div>
      )}

      {!connected && <div className="control-offline-tip">展示窗已断开，操作暂不可用。若展示窗已刷新，请从其「双屏控制」重新打开控制窗配对。</div>}
    </div>
  )
}
