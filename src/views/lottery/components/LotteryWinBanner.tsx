import { useEffect, useState } from 'react'
import { bus } from '../core/event-bus'
import STATUS from '../core/lottery-status'
import type { Card } from '../core/lottery-types'
import './lottery-win-banner.scss'

interface RevealData { prizeName: string; prizeImg?: string; winners: Card[] }

// A title above the result keeps the completed camera move visible.
export default function LotteryWinBanner() {
  const [reveal, setReveal] = useState<RevealData | null>(null)
  useEffect(() => {
    const onReveal = (data: RevealData) => setReveal(data)
    const unsubscribe = STATUS.subscribe(() => {
      if (['preparing', 'idle', 'init'].includes(STATUS.getPhase())) setReveal(null)
    })
    bus.on('lottery-win-reveal', onReveal)
    return () => { bus.off('lottery-win-reveal', onReveal); unsubscribe() }
  }, [])
  if (!reveal) return null
  return <button type="button" className="lottery-win-banner" onClick={() => setReveal(null)} aria-label={`收起${reveal.prizeName}揭晓标题`}>
    {reveal.prizeImg && <img className="banner-prize-img" src={reveal.prizeImg} alt="" />}
    <span className="banner-inner">
      <span className="banner-congrats">恭喜中奖 · {reveal.winners.length} 位</span>
      <span className="banner-prize-name">{reveal.prizeName}</span>
    </span>
    <span className="banner-winners" aria-live="polite">
      {reveal.winners.map(w => <span className="banner-winner" key={w.id}>{w.name}</span>)}
    </span>
  </button>
}
