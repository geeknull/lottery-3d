import { useEffect, useState } from 'react'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion } from '../core/lottery-store'
import { lotteryStart, lotteryStop, tableShow } from '../core/lottery-controller'
import { startShowcase, stopShowcase, returnToTable, isShowcaseActive } from '../core/lottery-showcase'
import { voidWinner, undoLastDraw } from '../core/lottery-algorithm'
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

async function resetData() {
  if (await appConfirm('是否要重置所有抽奖数据？此操作不可恢复！', { confirmText: '重置' })) {
    lotteryConfig.clearLocalStorage()
    location.reload()
  }
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
  useLotteryVersion() // 中奖名单面板打开期间数据变化也能刷新
  const prizeList = lotteryConfig.prizeList

  function handleVoid(returnToPool: boolean) {
    if (!voidTarget) return
    const ok = voidWinner(voidTarget.prizeId, voidTarget.card.id, returnToPool)
    if (ok) {
      setCardPrizeMark(voidTarget.card.id, false) // 卡片墙去掉中奖染色
    }
    setVoidTarget(null)
  }

  const [showcaseOn, setShowcaseOn] = useState(isShowcaseActive())

  useEffect(() => {
    bus.on('lottery-3d-init', () => {
      STATUS.setStatusWait()
    })
    const syncShowcase = () => setShowcaseOn(isShowcaseActive())
    bus.on('showcase-change', syncShowcase)
    return () => bus.off('showcase-change', syncShowcase)
  }, [])

  const btnDisplay = { display: showBtn ? undefined : 'none' }

  return (
    <div className="lottery-action">
      <div id="menu">
        <div style={{ marginBottom: '10px' }}>
          <button id="table" style={btnDisplay}>TABLE</button>
          <button id="sphere" style={btnDisplay}>SPHERE</button>
          <button id="helix" style={btnDisplay}>HELIX</button>
          <button id="grid" style={btnDisplay}>GRID</button>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <button id="lotteryStart" title="快捷键：空格 / 翻页笔（PageDown、B、Enter）" onClick={lotteryStart}>开始抽奖</button>
          <button id="lotteryStop" title="快捷键：空格 / 翻页笔（PageDown、B、Enter）" onClick={lotteryStop}>停！</button>
          <button id="tableShow" onClick={tableShow}>展示全部</button>
          <button id="winShow" onClick={() => setShowAllWinUserPanel(true)}>展示中奖</button>
          <button id="showcase" title="待机时自动循环球体/螺旋/网格/平铺布局" onClick={toggleShowcase}>
            {showcaseOn ? '停止轮播' : '轮播展示'}
          </button>
        </div>
        <div>
          <button id="undo" title="撤销最近一轮抽奖，名额退回可重抽" onClick={handleUndo}>撤销上轮</button>
          <button id="reset" onClick={resetData}>重置所有数据</button>
        </div>
      </div>
      {showAllWinUserPanel && (
        <div className="show-all-win-user">
          <span className="close-btn" onClick={() => { setShowAllWinUserPanel(false); setVoidTarget(null) }}>✖</span>
          {prizeList.map((item, index) => (
            <div className="prize-win-item" key={index}>
              <div className="prize-name">{item.name}</div>
              <div className="prize-win-user">
                {/* 每十个换行 */}
                {getRenderArr(item.cardListWin).map((arr, arrIndex) => (
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
