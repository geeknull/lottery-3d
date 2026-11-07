import { useEffect, useState } from 'react'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'
import './lottery-stale-notice.scss'

// 另一个窗口更新了正式进度后，此窗口继续操作会造成重复抽取，只能刷新。
export default function LotteryStaleNotice() {
  // 事件可能在组件挂载前发出，所以初值直接读当前状态
  const [stale, setStale] = useState(() => lotteryConfig.isProgressStale())

  useEffect(() => {
    const onStale = () => setStale(true)
    bus.on('progress-stale', onStale)
    return () => bus.off('progress-stale', onStale)
  }, [])

  if (!stale) return null

  return (
    <div className="lottery-stale-notice" role="dialog" aria-modal="true" aria-labelledby="stale-notice-title">
      <div className="stale-card">
        <h3 id="stale-notice-title">此窗口的进度已过期</h3>
        <p>另一个窗口更新了正式抽奖进度。为避免覆盖结果，此窗口已停止保存。请关闭多余的窗口，或刷新此窗口载入最新进度。</p>
        <button type="button" onClick={() => window.location.reload()}>刷新并载入最新进度</button>
      </div>
    </div>
  )
}
