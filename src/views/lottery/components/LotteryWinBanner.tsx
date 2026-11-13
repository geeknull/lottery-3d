import { useEffect, useMemo, useState } from 'react'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'
import STATUS from '../core/lottery-status'
import { createWinnerLabeler } from '../core/participant-identity'
import type { Card } from '../core/lottery-types'
import './lottery-win-banner.scss'

interface RevealData { prizeName: string; prizeImg?: string; winners: Card[] }

// A title above the result keeps the completed camera move visible.
export default function LotteryWinBanner() {
  const [reveal, setReveal] = useState<RevealData | null>(null)
  // 名单在页面生命周期内不变：重名者加工号（无工号用部门）后缀
  const labelOf = useMemo(() => createWinnerLabeler(lotteryConfig.cardList), [])
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
      {reveal.winners.map(w => <span className="banner-winner" key={w.id}>{labelOf(w)}</span>)}
    </span>
  </button>
}
