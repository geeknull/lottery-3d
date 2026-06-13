import { useEffect, useState } from 'react'
import { getNeedRefresh, subscribeUpdate, applyUpdate } from '../core/pwa-update'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import './lottery-update-banner.scss'

// 右下角不打扰横幅：发现新版本时提示，由用户在两轮抽奖之间择机点更新。
// 看场合提示——本场抽奖一旦开始（已抽出中奖人），更新会刷新页面、可能影响进度，
// 此时改为警告措辞、劝主持人抽完再更新；空闲时则正常鼓励更新。始终由用户点击，不自动刷新。
// 关闭仅本次隐藏，下次后台检查/刷新仍会再提示。
export default function LotteryUpdateBanner() {
  useLotteryVersion() // 抽奖进度变化时切换提示措辞
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

  // 已抽出过中奖人 = 本场进行中，更新有打断/丢进度风险
  const inProgress = lotteryConfig.cardListWinAll.length > 0

  if (inProgress) {
    return (
      <div className="lottery-update-banner warn" role="alert">
        <span className="update-icon" aria-hidden="true">⚠</span>
        <span className="update-text">有新版本，但本场抽奖已开始 —— 更新会刷新页面、可能影响当前进度，建议抽完再更新</span>
        <button className="update-apply" onClick={applyUpdate}>仍要更新</button>
        <span className="update-dismiss" title="稍后再说" onClick={() => setDismissed(true)}>稍后</span>
      </div>
    )
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
