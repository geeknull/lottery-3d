import { useState, useEffect } from 'react'
import LotteryStarfield from './LotteryStarfield'
import LotteryConfetti from './LotteryConfetti'
import LotteryCountdown from './LotteryCountdown'
import LotteryWinBanner from './LotteryWinBanner'
import LotteryMusic from './LotteryMusic'
import LotteryPrize from './LotteryPrize'
import Lottery3d from './Lottery3d'
import LotteryConfigPanel from './LotteryConfigPanel'
import LotteryFairness from './LotteryFairness'
import LotteryHistory from './LotteryHistory'
import LotteryUpdateBanner from './LotteryUpdateBanner'
import LotteryCompatNotice from './LotteryCompatNotice'
import { FeedbackHost } from './feedback'
import { useLotteryShortcuts, toggleFullscreen } from '../core/lottery-shortcuts'
import { useDisplaySync } from './useDisplaySync'
import lotteryConfig from '../core/lottery-config'
import { bus } from '../core/event-bus'
import { toast } from './feedback'
import { isDualScreenSupported } from '../core/lottery-sync'
import './lottery.scss'

function openControlWindow() {
  if (!isDualScreenSupported()) {
    toast('当前浏览器不支持双屏遥控（需 Chrome / Edge / Firefox，或 Safari 15.4+）')
    return void 0
  }
  window.open(window.location.pathname + '?mode=control', 'lottery-control', 'width=460,height=760')
}

export default function Lottery() {
  const [showConfig, setShowConfig] = useState(false)
  const [showFairness, setShowFairness] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const controlConnected = useDisplaySync() // 控制窗连上后自动隐藏操作 UI
  const dualSupported = isDualScreenSupported() // 老浏览器无 BroadcastChannel 时置灰双屏按钮
  useLotteryShortcuts() // 空格=开始/停止，F=全屏

  // 抽奖进度写入失败（配额超限/隐私模式）时提醒主持人及时导出中奖名单
  useEffect(() => {
    const onStorageError = () => toast('⚠ 抽奖进度保存失败，本地存储可能已满，请尽快到配置面板导出中奖名单', 8000)
    bus.on('storage-error', onStorageError)
    return () => bus.off('storage-error', onStorageError)
  }, [])

  return (
    <div className={'lottery-wrap' + (controlConnected ? ' control-active' : '')}>
      <LotteryStarfield />
      <LotteryConfetti />
      <LotteryCountdown />
      <LotteryWinBanner />
      <LotteryMusic />
      <FeedbackHost />
      <LotteryUpdateBanner />
      <LotteryCompatNotice />
      <div className="hud-btn fullscreen-btn" data-label="全屏" title="全屏（快捷键 F）" onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </div>
      <div className="hud-btn history-btn" data-label="历史" title="抽奖历史" onClick={() => setShowHistory(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </div>
      <div className={'hud-btn dual-screen-btn' + (dualSupported ? '' : ' hud-disabled')} data-label={dualSupported ? '双屏控制' : '双屏不可用'} title={dualSupported ? '打开控制窗（双屏遥控）' : '当前浏览器不支持双屏（需 Safari 15.4+）'} onClick={openControlWindow}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="12" height="9" rx="1.5" />
          <path d="M7 18h5M9.5 14v3" />
          <rect x="13.5" y="10" width="7.5" height="9" rx="1.5" />
        </svg>
      </div>
      <a className="hud-btn github-btn" data-label="GitHub 源码" title="在 GitHub 查看源码" href="https://github.com/geeknull/lottery-3d" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56 0-.27-.01-1.16-.02-2.1-3.34.71-4.04-1.41-4.04-1.41-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.71.08-.71 1.2.08 1.84 1.21 1.84 1.21 1.07 1.79 2.81 1.27 3.5.97.11-.76.42-1.27.76-1.56-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.53-2.81 5.54-5.49 5.83.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.21.69.83.57C20.56 21.88 24 17.48 24 12.29 24 5.78 18.63.5 12 .5z" />
        </svg>
      </a>
      <div className="hud-btn fairness-btn" data-label="公平性" title="抽奖公平性（可验证）" onClick={() => setShowFairness(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      </div>
      <div className="hud-btn config-btn" data-label="配置" title="抽奖配置" onClick={() => setShowConfig(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
      {showConfig && <LotteryConfigPanel onClose={() => setShowConfig(false)} />}
      {showFairness && <LotteryFairness onClose={() => setShowFairness(false)} />}
      {showHistory && <LotteryHistory onClose={() => setShowHistory(false)} />}
      <header className="lottery-header">
        <span>{lotteryConfig.headerTitle}</span>
      </header>
      <div className="lottery-content">
        <LotteryPrize />
        <Lottery3d />
      </div>
    </div>
  )
}
