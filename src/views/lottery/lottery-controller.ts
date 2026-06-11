import { setSphereDist } from './3d-calc-distance'
import { transform, transformStatus } from './3d-animate'
import lotteryConfig from './lottery-config'
import { cardFlyAnimation, rotateBall, rotateBallStop } from './3d-action'
import { getRandomCard } from './lottery-algorithm'
import STATUS from './3d-status'
import { toast } from './feedback'
import { bus } from './event-bus'
import { stopShowcase } from './lottery-showcase'

// 抽奖的开始/停止流程。从 LotteryAction 组件抽出来，
// 按钮和键盘快捷键共用同一套入口。

// 球体是否正在旋转抽奖中（区别于奖项切换等普通动画的 RUNNING 状态）
let spinning = false

export function isSpinning(): boolean {
  return spinning
}

export async function lotteryStart() {
  stopShowcase() // 轮播展示中开始抽奖则先停轮播
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
  spinning = true
  rotateBall()
}

export async function lotteryStop() {
  const currentPrize = lotteryConfig.getCurrentPrize()
  if (!currentPrize) {
    toast('请选择奖项')
    STATUS.setStatusWait()
    return void 0
  }
  spinning = false
  rotateBallStop()
  const cardSelect = getRandomCard(currentPrize) // 当前的奖项
  const cardSelectIndex = cardSelect.map(_ => _.index)

  await setSphereDist(2, 500)
  await cardFlyAnimation(cardSelectIndex)
  // 彩带庆祝 + 揭晓横幅
  bus.emit('lottery-win-reveal', { prizeName: currentPrize.name, prizeImg: currentPrize.img || undefined, winners: cardSelect })
  STATUS.setStatusWait()
}

// 空格快捷键：旋转中则开奖，否则开始抽奖
export function toggleDraw() {
  if (spinning) {
    lotteryStop()
  } else {
    lotteryStart()
  }
}

export async function tableShow() {
  stopShowcase()
  if (STATUS.getStatus() !== STATUS.RUNNING_LOTTERY) {
    STATUS.setStatusRun()
    await transform('table', 1000) // sphere
    STATUS.setStatusWait()
  } else {
    toast('抽奖正在运行中，请等待后再操作！')
  }
}
