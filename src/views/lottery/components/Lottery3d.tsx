// https://threejs.org/examples/css3d_periodictable.html
import { useEffect, useState, useSyncExternalStore } from 'react'
import '../3d/origin-main.css'
import '../3d/origin-periodictable.css'
import '../3d/lottery-custom.css'
import '../3d/lottery-3d.scss'
import { init, animate, transform } from '../3d/3d'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'
import { resetView } from '../core/lottery-controller'
import STATUS from '../core/lottery-status'

export default function Lottery3d() {
  const [ready, setReady] = useState(false)
  const [resetting, setResetting] = useState(false)
  const status = useSyncExternalStore(STATUS.subscribe, STATUS.getStatus)

  useEffect(() => {
    (async () => {
      // 组件层做 core→3d 接线：把名单/行列数注入 3D 层，3d 层自身不 import lottery-config
      init({
        cardList: lotteryConfig.cardList,
        colCount: lotteryConfig.colCount,
        rowCount: lotteryConfig.rowCount,
        cardListWinAll: lotteryConfig.cardListWinAll,
      })
      animate()
      await transform('table', 1000) // sphere
      setReady(true)
      bus.emit('lottery-3d-init')
    })()
  }, [])

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
