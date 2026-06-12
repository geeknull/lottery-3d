import { useEffect, useState } from 'react'
import { getNeedRefresh, subscribeUpdate, applyUpdate } from '../core/pwa-update'
import './lottery-update-banner.scss'

// 右下角不打扰横幅：发现新版本时提示，由用户在两轮抽奖之间择机点更新。
// 关闭仅本次隐藏，下次后台检查/刷新仍会再提示。
export default function LotteryUpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(getNeedRefresh())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => subscribeUpdate(v => {
    setNeedRefresh(v)
    if (v) {
      setDismissed(false) // 又发现新版，重新提示
    }
  }), [])

  if (!needRefresh || dismissed) {
    return null
  }

  return (
    <div className="lottery-update-banner" role="status">
      <span className="update-icon" aria-hidden="true">✨</span>
      <span className="update-text">有新版本可用</span>
      <button className="update-apply" onClick={applyUpdate}>立即更新</button>
      <span className="update-dismiss" title="稍后再说" onClick={() => setDismissed(true)}>✕</span>
    </div>
  )
}
