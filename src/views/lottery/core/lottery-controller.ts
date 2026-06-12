import { setSphereDist } from '../3d/3d-calc-distance'
import { transform, transformStatus } from '../3d/3d-animate'
import lotteryConfig from './lottery-config'
import { cardFlyAnimation, rotateBall, rotateBallStop } from '../3d/3d-action'
import { getRandomCard } from './lottery-algorithm'
import STATUS from '../3d/3d-status'
import { toast } from '../components/feedback'
import { bus } from './event-bus'
import { stopShowcase } from './lottery-showcase'
import { ensureSeedCommit } from './lottery-fairness'
import { startSpinTicks, stopSpinTicks, playReveal } from './lottery-sound'
import { isCountdownEnabled, playCountdown } from './lottery-countdown'

// 抽奖的开始/停止流程。从 LotteryAction 组件抽出来，
// 按钮和键盘快捷键共用同一套入口。

// 球体是否正在旋转抽奖中（区别于奖项切换等普通动画的 RUNNING 状态）
let spinning = false

export function isSpinning(): boolean {
  return spinning
}

// 改变旋转状态并广播，让主操作按钮在「开始抽奖 ↔ 停！」间切换文案
function setSpinning(v: boolean) {
  spinning = v
  bus.emit('spin-change', v)
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

  // 第一次开抽前固定种子承诺（开始旋转即等于"已锁定结果"）
  void ensureSeedCommit()

  // 先回到table状态再抽奖
  STATUS.setStatusRun()
  if (transformStatus !== 'table') {
    await transform('table', 500)
  }
  await transform('sphere', 300)
  // 3-2-1 蓄力倒计时（可关闭）
  if (isCountdownEnabled()) {
    await playCountdown()
  }
  setSpinning(true)
  startSpinTicks() // 旋转滴答音效
  rotateBall()
}

export async function lotteryStop() {
  const currentPrize = lotteryConfig.getCurrentPrize()
  if (!currentPrize) {
    toast('请选择奖项')
    STATUS.setStatusWait()
    return void 0
  }
  setSpinning(false)
  stopSpinTicks()
  rotateBallStop()
  const cardSelect = getRandomCard(currentPrize) // 当前的奖项
  const cardSelectIndex = cardSelect.map(_ => _.index)

  await setSphereDist(2, 500)
  await cardFlyAnimation(cardSelectIndex)
  // 彩带庆祝 + 揭晓横幅 + 揭晓音效
  playReveal()
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
