import { useEffect, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import { toggleDraw, isSpinning, tableShow } from '../core/lottery-controller'
import { startShowcase, stopShowcase, returnToTable, isShowcaseActive } from '../core/lottery-showcase'
import { voidWinner, undoLastDraw } from '../core/lottery-algorithm'
import { exportWinnersPoster } from '../core/poster'
import { setCardPrizeMark } from '../3d/3d-card-element'
import STATUS from '../3d/3d-status'
import { toast, appConfirm } from './feedback'
import { bus } from '../core/event-bus'
import type { Card } from '../core/lottery-types'
import './lottery-action.scss'

function getRenderArr(arr: Card[]) {
  const arrRes: Card[][] = []
  const n = 10
  const len = arr.length
  const lineNum = len % n === 0 ? len / n : Math.floor((len / n) + 1)
  for (let i = 0; i < lineNum; i++) {
    const temp = arr.slice(i * n, i * n + n)
    arrRes.push(JSON.parse(JSON.stringify(temp)))
  }
  return arrRes
}

async function handleUndo() {
  if (STATUS.getStatus() !== STATUS.WAIT_LOTTERY) {
    toast('请等当前动画结束再撤销')
    return void 0
  }
  if (!lotteryConfig.drawLog.some(e => e.type === 'draw' && !e.undone)) {
    toast('没有可撤销的抽奖')
    return void 0
  }
  if (!(await appConfirm('撤销最近一轮抽奖？该轮中奖作废、名额退回，重抽会得到新的随机结果。', { confirmText: '撤销' }))) {
    return void 0
  }
  const ids = undoLastDraw()
  if (ids) {
    ids.forEach(id => setCardPrizeMark(id, false)) // 卡片墙去染色
    toast('已撤销最近一轮抽奖')
  }
}

async function toggleShowcase() {
  if (isShowcaseActive()) {
    stopShowcase()
    await returnToTable()
  } else {
    if (STATUS.getStatus() !== STATUS.WAIT_LOTTERY) {
      toast('正在抽奖或动画中，稍后再开启轮播展示')
      return void 0
    }
    startShowcase()
  }
}

// 待作废的中奖记录
interface VoidTarget {
  prizeId: string
  prizeName: string
  card: Card
}

export default function LotteryAction() {
  const showBtn = false
  const [showAllWinUserPanel, setShowAllWinUserPanel] = useState(false)
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null)
  const [winSearch, setWinSearch] = useState('')
  useLotteryVersion() // 中奖名单面板打开期间数据变化也能刷新
  const prizeList = lotteryConfig.prizeList

  // 中奖名单按姓名搜索（大名单现场作废时快速定位），不碰抽奖逻辑
  const winTerm = winSearch.trim()
  const filteredWinPrizes = prizeList
    .map(item => ({ item, matched: winTerm ? item.cardListWin.filter(u => u.name.includes(winTerm)) : item.cardListWin }))
    .filter(g => !winTerm || g.matched.length > 0)

  function handleVoid(returnToPool: boolean) {
    if (!voidTarget) return
    const ok = voidWinner(voidTarget.prizeId, voidTarget.card.id, returnToPool)
    if (ok) {
      setCardPrizeMark(voidTarget.card.id, false) // 卡片墙去掉中奖染色
    }
    setVoidTarget(null)
  }

  const [showcaseOn, setShowcaseOn] = useState(isShowcaseActive())
  const [spinning, setSpinning] = useState(isSpinning())

  useEffect(() => {
    bus.on('lottery-3d-init', () => {
      STATUS.setStatusWait()
    })
    const syncShowcase = () => setShowcaseOn(isShowcaseActive())
    bus.on('showcase-change', syncShowcase)
    const syncSpin = (v: boolean) => setSpinning(v)
    bus.on('spin-change', syncSpin)
    return () => {
      bus.off('showcase-change', syncShowcase)
      bus.off('spin-change', syncSpin)
    }
  }, [])

  const btnDisplay = { display: showBtn ? undefined : 'none' }

  return (
    <div className="lottery-action">
      <div id="menu">
        <div className="hidden-layout-btns">
          <button id="table" style={btnDisplay}>TABLE</button>
          <button id="sphere" style={btnDisplay}>SPHERE</button>
          <button id="helix" style={btnDisplay}>HELIX</button>
          <button id="grid" style={btnDisplay}>GRID</button>
        </div>
        <button
          id="primaryCta"
          className={'primary-cta' + (spinning ? ' is-spinning' : '')}
          title="快捷键：空格 / 翻页笔（PageDown、B、Enter）"
          onClick={toggleDraw}
        >
          <span className="cta-dot" aria-hidden="true" />
          {spinning ? '停 !' : '开始抽奖'}
        </button>
        <div className="secondary-actions">
          <button className="icon-action" title="平铺展示全部卡片" onClick={tableShow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>展示全部</span>
          </button>
          <button className="icon-action" title="查看中奖名单（可作废补抽）" onClick={() => setShowAllWinUserPanel(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
            </svg>
            <span>展示中奖</span>
          </button>
          <button className={'icon-action' + (showcaseOn ? ' active' : '')} title="待机时自动循环球体/螺旋/网格/平铺布局" onClick={toggleShowcase}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <span>{showcaseOn ? '停止轮播' : '轮播展示'}</span>
          </button>
          <button className="icon-action" title="撤销最近一轮抽奖，名额退回可重抽" onClick={handleUndo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 14L4 9l5-5" /><path d="M4 9h11a6 6 0 0 1 0 12h-4" />
            </svg>
            <span>撤销</span>
          </button>
        </div>
      </div>
      {showAllWinUserPanel && (
        <div className="show-all-win-user">
          <span className="close-btn" onClick={() => { setShowAllWinUserPanel(false); setVoidTarget(null); setWinSearch('') }}>✖</span>
          <div className="win-panel-tools">
            <input
              className="win-search"
              type="search"
              placeholder="搜索中奖人姓名…"
              value={winSearch}
              onChange={e => setWinSearch(e.target.value)}
            />
            <button
              className="export-poster-btn"
              onClick={() => { if (!exportWinnersPoster()) toast('还没有中奖记录') }}
            >导出喜报图</button>
          </div>
          {winTerm && filteredWinPrizes.length === 0 && (
            <div className="win-empty">没有匹配「{winTerm}」的中奖人</div>
          )}
          {filteredWinPrizes.map(({ item, matched }, index) => (
            <div className="prize-win-item" key={index}>
              <div className="prize-name">{item.name}</div>
              <div className="prize-win-user">
                {/* 每十个换行 */}
                {getRenderArr(matched).map((arr, arrIndex) => (
                  <div className="prize-win-user-name-wrap" key={arrIndex}>
                    {arr.map((user, userIndex) => (
                      <span className="prize-win-user-name" key={userIndex}>
                        {user.name}
                        <i
                          className="void-btn"
                          title="作废此中奖（名额退回，可补抽）"
                          onClick={() => setVoidTarget({ prizeId: item.id, prizeName: item.name, card: user })}
                        >✖</i>
                      </span>
                    ))}
                    <br />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {voidTarget && (
            <div className="void-confirm">
              <p>
                作废「{voidTarget.prizeName} - {voidTarget.card.name}」的中奖记录？
                名额将退回该奖项，可重新抽取。
              </p>
              <div className="void-confirm-btns">
                <button onClick={() => handleVoid(true)}>作废，TA 回到奖池</button>
                <button onClick={() => handleVoid(false)}>作废，TA 不再参与</button>
                <button onClick={() => setVoidTarget(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
