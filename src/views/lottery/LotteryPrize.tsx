import { useEffect } from 'react'
import LotteryAction from './LotteryAction'
import lotteryConfig from './lottery-config'
import { useLotteryVersion, notifyLotteryChange } from './lottery-store'
import { transform } from './3d-animate'
import STATUS from './3d-status'
import { toast } from './feedback'
import { stopShowcase } from './lottery-showcase'
import type { Prize } from './lottery-types'
import './lottery-prize.scss'

async function selectPrize(prize: Prize) {
  stopShowcase()
  if (STATUS.isRun()) {
    toast('正在抽奖中，不能切换奖项！')
    return void 0
  }
  STATUS.setStatusRun()
  lotteryConfig.currentPrize = prize.id
  notifyLotteryChange()
  await transform('table', 1000) // TODO重复点击处理
  STATUS.setStatusWait()
}

export default function LotteryPrize() {
  useLotteryVersion() // 抽奖/切换奖项后剩余数量、进度条、选中态自动刷新
  const prizeList = lotteryConfig.prizeList
  // 选中态直接从全局配置派生：沿用已选奖项，否则默认最后一个（等级最低的奖项）
  const currentPrize = lotteryConfig.getCurrentPrize()
  const currentPrizeIndex = currentPrize
    ? prizeList.findIndex(_ => _.id === currentPrize.id)
    : prizeList.length - 1

  useEffect(() => {
    // 把默认选中同步回全局配置（渲染期不允许改外部状态，放到 effect 里）
    if (!lotteryConfig.currentPrize) {
      lotteryConfig.currentPrize = prizeList[prizeList.length - 1]['id']
      notifyLotteryChange()
    }
  }, [prizeList])

  return (
    <div className="prize-wrap">
      <ul className="prize-list">
        {prizeList.map((item, index) => (
          <li
            key={index}
            className={'prize-item' + (index === currentPrizeIndex ? ' shine' : '')}
            onClick={() => selectPrize(item)}
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
