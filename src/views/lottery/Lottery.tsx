import { useState } from 'react'
import LotteryStarfield from './LotteryStarfield'
import LotteryMusic from './LotteryMusic'
import LotteryPrize from './LotteryPrize'
import Lottery3d from './Lottery3d'
import LotteryConfigPanel from './LotteryConfigPanel'
import lotteryConfig from './lottery-config'
import './lottery.scss'

export default function Lottery() {
  const [showConfig, setShowConfig] = useState(false)

  return (
    <div className="lottery-wrap">
      <LotteryStarfield />
      <LotteryMusic />
      <div className="config-btn" title="抽奖配置" onClick={() => setShowConfig(true)}>⚙</div>
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
