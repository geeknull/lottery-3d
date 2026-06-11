import { useEffect, useState } from 'react'
import { setSphereDist } from './3d-calc-distance'
import { transform, transformStatus } from './3d-animate'
import lotteryConfig from './lottery-config'
import { useLotteryVersion } from './lottery-store'
import { cardFlyAnimation, rotateBall, rotateBallStop } from './3d-action'
import { getRandomCard, voidWinner } from './lottery-algorithm'
import { setCardPrizeMark } from './3d-card-element'
import STATUS from './3d-status'
import { toast, appConfirm } from './feedback'
import { bus } from './event-bus'
import type { Card } from './lottery-types'
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

async function lotteryStart() {
  if (STATUS.getStatus() !== STATUS.WAIT_LOTTERY) {
    toast('正在抽奖或初始化，请等待一下')
    return void 0
  }
  const currentPrize = lotteryConfig.getCurrentPrize()
  if (!currentPrize) {
    toast('请选择奖项')
    STATUS.setStatusWait()
    return void 0
  }
  if (currentPrize.countRemain <= 0) {
    toast(currentPrize.name + '已经抽取完毕，请选择其他奖项')
    STATUS.setStatusWait()
    return void 0
  }

  // 先回到table状态再抽奖
  STATUS.setStatusRun()
  if (transformStatus !== 'table') {
    await transform('table', 500)
  }
  await transform('sphere', 300)
  rotateBall()
}

async function lotteryStop() {
  const currentPrize = lotteryConfig.getCurrentPrize()
  if (!currentPrize) {
    toast('请选择奖项')
    STATUS.setStatusWait()
    return void 0
  }
  rotateBallStop()
  const cardSelect = getRandomCard(currentPrize) // 当前的奖项
  const cardSelectIndex = cardSelect.map(_ => _.index)

  await setSphereDist(2, 500)
  await cardFlyAnimation(cardSelectIndex)
  STATUS.setStatusWait()
}

async function tableShow() {
  if (STATUS.getStatus() !== STATUS.RUNNING_LOTTERY) {
    STATUS.setStatusRun()
    await transform('table', 1000) // sphere
    STATUS.setStatusWait()
  } else {
    toast('抽奖正在运行中，请等待后再操作！')
  }
}

async function resetData() {
  if (await appConfirm('是否要重置所有抽奖数据？此操作不可恢复！', { confirmText: '重置' })) {
    lotteryConfig.clearLocalStorage()
    location.reload()
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

  useEffect(() => {
    bus.on('lottery-3d-init', () => {
      STATUS.setStatusWait()
    })
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
          <button id="lotteryStart" onClick={lotteryStart}>开始抽奖</button>
          <button id="lotteryStop" onClick={lotteryStop}>停！</button>
          <button id="tableShow" onClick={tableShow}>展示全部</button>
          <button id="winShow" onClick={() => setShowAllWinUserPanel(true)}>展示中奖</button>
        </div>
        <div>
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
