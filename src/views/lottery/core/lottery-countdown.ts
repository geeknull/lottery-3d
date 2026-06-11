// 开始抽奖前的 3-2-1 倒计时蓄力。纯逻辑（runCountdown）可注入依赖测试，
// 真实播放（playCountdown）走 bus 事件驱动 LotteryCountdown 组件。
import { bus } from './event-bus'
import { playTick } from './lottery-sound'

const COUNTDOWN_KEY = '___lottery_countdown___'
const STEP_MS = 800 // 每个数字停留
const GO_MS = 500 // GO 停留

export function isCountdownEnabled(): boolean {
  return localStorage.getItem(COUNTDOWN_KEY) !== 'off' // 默认开启
}

export function setCountdownEnabled(on: boolean): void {
  localStorage.setItem(COUNTDOWN_KEY, on ? 'on' : 'off')
}

export interface CountdownDeps {
  onTick: (n: number) => void // n>0 数字，0=GO，-1=隐藏
  wait: (ms: number) => Promise<void>
  beep?: () => void
}

// 倒计时驱动逻辑：从 from 数到 1，再 GO，再隐藏
export async function runCountdown(from: number, deps: CountdownDeps): Promise<void> {
  for (let n = from; n >= 1; n--) {
    deps.onTick(n)
    deps.beep?.()
    await deps.wait(STEP_MS)
  }
  deps.onTick(0) // GO
  await deps.wait(GO_MS)
  deps.onTick(-1) // 隐藏
}

// 真实播放：把当前数字广播给倒计时组件，用真实定时器
export function playCountdown(from = 3): Promise<void> {
  return runCountdown(from, {
    onTick: n => bus.emit('countdown', n),
    wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
    beep: () => playTick(),
  })
}
