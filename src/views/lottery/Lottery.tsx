import LotteryStarfield from './LotteryStarfield'
import LotteryMusic from './LotteryMusic'
import LotteryPrize from './LotteryPrize'
import Lottery3d from './Lottery3d'
import lotteryConfig from './lottery-config'
import './lottery.scss'

export default function Lottery() {
  return (
    <div className="lottery-wrap">
      <LotteryStarfield />
      <LotteryMusic />
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
