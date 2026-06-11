import { useEffect, useState } from 'react'
import { bus } from '../core/event-bus'
import './lottery-countdown.scss'

// 开始抽奖前的 3-2-1 蓄力倒计时（由 lottery-countdown 的 playCountdown 驱动）
export default function LotteryCountdown() {
  const [n, setN] = useState(-1) // n>0 数字，0=GO，-1=隐藏

  useEffect(() => {
    const onCountdown = (value: number) => setN(value)
    bus.on('countdown', onCountdown)
    return () => bus.off('countdown', onCountdown)
  }, [])

  if (n < 0) {
    return null
  }

  return (
    <div className="lottery-countdown">
      <span className="countdown-num" key={n}>{n === 0 ? 'GO!' : n}</span>
    </div>
  )
}
