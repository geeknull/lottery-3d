import { useEffect, useRef, useState } from 'react'
import { bus } from '../core/event-bus'
import type { Card } from '../core/lottery-types'
import './lottery-win-banner.scss'

interface RevealData {
  prizeName: string
  prizeImg?: string
  winners: Card[]
}

interface Props {
  duration?: number // 自动消失时长（毫秒）
}

// 开奖揭晓横幅：全屏大字展示奖项与中奖名单，台下最后一排也能看清
export default function LotteryWinBanner({ duration = 6000 }: Props) {
  const [reveal, setReveal] = useState<RevealData | null>(null)
  const timerRef = useRef(0)

  useEffect(() => {
    const onReveal = (data: RevealData) => {
      setReveal(data)
      clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setReveal(null), duration)
    }
    bus.on('lottery-win-reveal', onReveal)
    return () => {
      bus.off('lottery-win-reveal', onReveal)
      clearTimeout(timerRef.current)
    }
  }, [duration])

  if (!reveal) {
    return null
  }

  return (
    <div className="lottery-win-banner" onClick={() => setReveal(null)}>
      <div className="banner-inner">
        <div className="banner-congrats">🎉 恭喜中奖 🎉</div>
        {reveal.prizeImg && <img className="banner-prize-img" src={reveal.prizeImg} alt="" />}
        <div className="banner-prize-name">{reveal.prizeName}</div>
        <div className="banner-winners">
          {reveal.winners.map(w => (
            <div className="banner-winner" key={w.id}>
              <img className="banner-avatar" src={w.avatar} alt="" />
              <span className="banner-name">{w.name}</span>
            </div>
          ))}
        </div>
        <div className="banner-hint">点击任意处关闭</div>
      </div>
    </div>
  )
}
