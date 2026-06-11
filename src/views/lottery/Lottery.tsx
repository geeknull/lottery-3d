import { useState } from 'react'
import LotteryStarfield from './LotteryStarfield'
import LotteryConfetti from './LotteryConfetti'
import LotteryMusic from './LotteryMusic'
import LotteryPrize from './LotteryPrize'
import Lottery3d from './Lottery3d'
import LotteryConfigPanel from './LotteryConfigPanel'
import { FeedbackHost } from './feedback'
import { useLotteryShortcuts, toggleFullscreen } from './lottery-shortcuts'
import lotteryConfig from './lottery-config'
import './lottery.scss'

export default function Lottery() {
  const [showConfig, setShowConfig] = useState(false)
  useLotteryShortcuts() // 空格=开始/停止，F=全屏

  return (
    <div className="lottery-wrap">
      <LotteryStarfield />
      <LotteryConfetti />
      <LotteryMusic />
      <FeedbackHost />
      <div className="hud-btn fullscreen-btn" title="全屏（快捷键 F）" onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M16 3h3a2 2 0 0 1 2 2v3" />
          <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </div>
      <div className="hud-btn config-btn" title="抽奖配置" onClick={() => setShowConfig(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
      {showConfig && <LotteryConfigPanel onClose={() => setShowConfig(false)} />}
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
