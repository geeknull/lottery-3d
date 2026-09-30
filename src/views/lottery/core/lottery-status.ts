import { bus } from './event-bus'

const WAIT_LOTTERY = 'wait'
const RUNNING_LOTTERY = 'running'
const INIT = 'init'

export type LotteryStatus = typeof WAIT_LOTTERY | typeof RUNNING_LOTTERY | typeof INIT
export type LotteryPhase = 'init' | 'idle' | 'preparing' | 'spinning' | 'revealing' | 'presenting' | 'transitioning'

// 唯一的运行状态；旧的 wait/running 与 spin-change 都从 phase 派生。
let phase: LotteryPhase = INIT
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getPhase(): LotteryPhase { return phase }

function getStatus(): LotteryStatus {
  if (phase === 'init') return INIT
  return phase === 'idle' || phase === 'presenting' ? WAIT_LOTTERY : RUNNING_LOTTERY
}

function setPhase(next: LotteryPhase) {
  if (phase === next) return
  const wasSpinning = phase === 'spinning'
  phase = next
  listeners.forEach(listener => listener())
  if (wasSpinning !== (phase === 'spinning')) bus.emit('spin-change', phase === 'spinning')
}

// 兼容布局轮播与初始化的粗粒度状态，不再保存第二份状态。
function setStatus(value: LotteryStatus) {
  setPhase(value === WAIT_LOTTERY ? 'idle' : value === RUNNING_LOTTERY ? 'transitioning' : 'init')
}

const status = {
  subscribe,
  getPhase,
  setPhase,
  getStatus,
  setStatus,
  setStatusWait: () => setPhase('idle'),
  setStatusRun: () => setPhase('transitioning'),
  isWait: () => getStatus() === WAIT_LOTTERY,
  isRun: () => getStatus() === RUNNING_LOTTERY,
  WAIT_LOTTERY,
  RUNNING_LOTTERY,
  INIT,
} as const
export default status
