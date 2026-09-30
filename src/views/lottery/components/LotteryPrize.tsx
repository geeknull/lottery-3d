import { useEffect } from 'react'
import LotteryAction from './LotteryAction'
import lotteryConfig from '../core/lottery-config'
import { useLotteryVersion, notifyLotteryChange } from '../core/lottery-store'
import { selectPrize } from '../core/lottery-controller'
import './lottery-prize.scss'

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
        {prizeList.map((item, index) => {
          const drawn = item.count - item.countRemain
          const progress = Math.max(0, Math.min(drawn, item.count))
          return (
            <li
              key={index}
              className={'prize-item' + (index === currentPrizeIndex ? ' shine' : '')}
              onClick={() => selectPrize(item.id)}
            >
              {item.img && (
                <div className="prize-item-left">
                  <img src={item.img} alt={item.name} />
                </div>
              )}
              <div className="prize-item-right">
                <div className="prize-item-title">{item.name}</div>
                <div className="prize-item-count-wrap">
                  <div className="prize-item-counts">
                    <div className="prize-item-count-text">已抽 {drawn}/{item.count}</div>
                    <div className="prize-item-remaining">剩余 {item.countRemain}</div>
                  </div>
                  <div
                    className="progress"
                    role="progressbar"
                    aria-label={`${item.name}已抽进度`}
                    aria-valuemin={0}
                    aria-valuemax={item.count}
                    aria-valuenow={progress}
                    aria-valuetext={`已抽 ${drawn}/${item.count}，剩余 ${item.countRemain}`}
                  >
                    <div
                      style={{ width: (item.count > 0 ? progress / item.count : 0) * 100 + '%' }}
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
          )
        })}
      </ul>
      <LotteryAction />
    </div>
  )
}
