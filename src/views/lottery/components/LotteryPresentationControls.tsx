import { useSyncExternalStore } from 'react'
import STATUS from '../core/lottery-status'
import { dispatchLotteryCommand, getPresentationState } from '../core/lottery-controller'

// Only changes the view of an already committed draw.
export default function LotteryPresentationControls() {
  const phase = useSyncExternalStore(STATUS.subscribe, STATUS.getPhase)
  const { winnerGroupIndex, groupCount, replayAvailable } = getPresentationState()
  if (phase === 'revealing') {
    return <div className="presentation-controls">
      <button type="button" onClick={() => void dispatchLotteryCommand({ action: 'skipReveal' })}>跳过动画，直接定格</button>
    </div>
  }
  if (!replayAvailable || (phase !== 'presenting' && phase !== 'idle')) return null
  return <div className="presentation-controls" aria-label="中奖展示控制">
    <div className="presentation-tools">
      <button type="button" onClick={() => void dispatchLotteryCommand({ action: 'replayReveal' })}>重放揭晓</button>
      {phase === 'presenting' && groupCount > 1 && <button type="button" onClick={() => void dispatchLotteryCommand({ action: 'winnerOverview' })}>中奖总览</button>}
    </div>
    {phase === 'presenting' && groupCount > 1 && <div className="presentation-groups">
      <button type="button" aria-label="上一组中奖者" disabled={winnerGroupIndex === null || winnerGroupIndex === 0} onClick={() => void dispatchLotteryCommand({ action: 'winnerPreviousGroup' })}>上一组</button>
      <span aria-live="polite">{winnerGroupIndex === null ? `全部 · ${groupCount} 组` : `${winnerGroupIndex + 1} / ${groupCount} 组`}</span>
      <button type="button" aria-label="下一组中奖者" disabled={winnerGroupIndex === groupCount - 1} onClick={() => void dispatchLotteryCommand({ action: 'winnerNextGroup' })}>{winnerGroupIndex === null ? '分组近景' : '下一组'}</button>
    </div>}
  </div>
}
