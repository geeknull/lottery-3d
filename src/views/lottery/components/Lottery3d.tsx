// https://threejs.org/examples/css3d_periodictable.html
import { useEffect, useState, useSyncExternalStore } from 'react'
import '../3d/origin-main.css'
import '../3d/origin-periodictable.css'
import '../3d/lottery-custom.css'
import '../3d/lottery-3d.scss'
import { createLotteryScene } from '../3d/3d'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'
import { disposeControllerFlow, resetView } from '../core/lottery-controller'
import STATUS from '../core/lottery-status'
import { setIdleAllowed } from '../3d/idle-orbit'

export default function Lottery3d() {
  const [ready, setReady] = useState(false)
  const [resetting, setResetting] = useState(false)
  const status = useSyncExternalStore(STATUS.subscribe, STATUS.getStatus)
  const phase = useSyncExternalStore(STATUS.subscribe, STATUS.getPhase)

  useEffect(() => {
    let mounted = true
    const stage = createLotteryScene({
      cardList: lotteryConfig.cardList,
      colCount: lotteryConfig.colCount,
      rowCount: lotteryConfig.rowCount,
      cardListWinAll: lotteryConfig.cardListWinAll,
    })
    void stage.transform('table', 1000).then(() => {
      if (!mounted) return
      setReady(true)
      bus.emit('lottery-3d-init')
    })
    return () => {
      mounted = false
      disposeControllerFlow()
      stage.dispose()
    }
  }, [])

  useEffect(() => { setIdleAllowed(phase === 'idle') }, [phase])

  async function handleResetView() {
    if (!ready || resetting || status !== STATUS.WAIT_LOTTERY) return
    setResetting(true)
    try {
      await resetView()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="lottery-3d-wrap">
      <div className="stage-orbits" aria-hidden="true"><i /><i /></div>
      <div id="container"></div>
      <div className="lottery-view-controls">
        <span className="lottery-view-hint">拖拽旋转 · 滚轮缩放</span>
        <button
          id="resetView"
          type="button"
          className="lottery-view-reset"
          onClick={handleResetView}
          disabled={!ready || resetting || status !== STATUS.WAIT_LOTTERY}
          aria-label="视角复位"
          aria-keyshortcuts="R"
          aria-busy={resetting}
          title="恢复居中视角，保留当前布局和抽奖结果（R）"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{resetting ? '复位中…' : '视角复位'}</span>
          <kbd aria-hidden="true">R</kbd>
        </button>
      </div>
    </div>
  )
}
