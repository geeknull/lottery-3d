import { useEffect, useState } from 'react'
import LotteryAction from './LotteryAction'
import lotteryConfig from './lottery-config'
import { transform } from './3d-animate'
import STATUS from './3d-status'
import type { Prize } from './lottery-types'
import './lottery-prize.scss'

async function selectPrize(prize: Prize, index: number, setCurrentPrizeIndex: (i: number) => void) {
  if (STATUS.isRun()) {
    alert('正在抽奖中或者已经是当前奖项状态，不能切换奖项！')
    return void 0
  }
  STATUS.setStatusRun()
  setCurrentPrizeIndex(index)
  lotteryConfig.currentPrize = prize.id
  await transform('table', 1000) // TODO重复点击处理
  STATUS.setStatusWait()
}

export default function LotteryPrize() {
  const prizeList = lotteryConfig.prizeList
  // 初始选中：沿用已选奖项，否则默认最后一个（等级最低的奖项）
  const [currentPrizeIndex, setCurrentPrizeIndex] = useState<number | null>(() => {
    const currentPrize = lotteryConfig.getCurrentPrize()
    if (!currentPrize) {
      return prizeList.length - 1
    }
    return lotteryConfig.prizeList.findIndex(_ => _.id === currentPrize.id)
  })

  useEffect(() => {
    // 把默认选中同步回全局配置（渲染期不允许改外部状态，放到 effect 里）
    if (!lotteryConfig.currentPrize) {
      lotteryConfig.currentPrize = prizeList[prizeList.length - 1]['id']
    }
  }, [prizeList])

  return (
    <div className="prize-wrap">
      <ul className="prize-list">
        {prizeList.map((item, index) => (
          <li
            key={index}
            className={'prize-item' + (index === currentPrizeIndex ? ' shine' : '')}
            onClick={() => selectPrize(item, index, setCurrentPrizeIndex)}
          >
            <div className="prize-item-right">
              <div className="prize-item-title">{item.name}</div>
              <div className="prize-item-count" style={{ display: 'none' }}>{item.count}名</div>
              <div className="prize-item-count-wrap">
                <div className="prize-item-count-text">{item.countRemain}/{item.count}</div>
                <div className="progress">
                  <div
                    style={{ width: (item.countRemain / item.count) * 100 + '%' }}
                    className="progress-bar progress-bar-danger progress-bar-striped active"
                  ></div>
                </div>
              </div>
            </div>
            <span className="line-1"></span>
            <span className="line-2"></span>
            <span className="line-3"></span>
            <span className="line-4"></span>
          </li>
        ))}
      </ul>
      <LotteryAction />
    </div>
  )
}
