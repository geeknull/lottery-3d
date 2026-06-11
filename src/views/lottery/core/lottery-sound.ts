// 抽奖音效：全部用 Web Audio API 合成，零外部音频文件（与背景音乐外链无关）。
// 旋转期间的滴答声 + 开奖时的上升琶音。失败一律静默（音效非关键功能）。

const SOUND_KEY = '___lottery_sound___'

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== 'off' // 默认开启
}

export function setSoundEnabled(on: boolean): void {
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  if (!on) {
    stopSpinTicks()
  }
}

let ctx: AudioContext | null = null

// 懒创建 AudioContext（须在用户手势后；抽奖由点击/按键触发，满足）
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext()
    }
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    return ctx
  } catch {
    return null
  }
}

// 合成一个带衰减包络的单音
function tone(freq: number, duration: number, type: OscillatorType, gain: number, startOffset = 0): void {
  const c = getCtx()
  if (!c) {
    return void 0
  }
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(g)
  g.connect(c.destination)
  const t = c.currentTime + startOffset
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.start(t)
  osc.stop(t + duration)
}

// 旋转滴答：短促高频
export function playTick(): void {
  if (!isSoundEnabled()) {
    return void 0
  }
  try {
    tone(820 + Math.random() * 240, 0.05, 'square', 0.05)
  } catch {
    /* 静默 */
  }
}

// 开奖揭晓：C-E-G-C 大三和弦上行琶音
export function playReveal(): void {
  if (!isSoundEnabled()) {
    return void 0
  }
  try {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => tone(f, 0.45, 'sine', 0.16, i * 0.09))
  } catch {
    /* 静默 */
  }
}

let tickTimer = 0

// 旋转期间循环滴答
export function startSpinTicks(): void {
  if (!isSoundEnabled()) {
    return void 0
  }
  stopSpinTicks()
  try {
    tickTimer = window.setInterval(playTick, 110)
  } catch {
    /* 静默 */
  }
}

export function stopSpinTicks(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = 0
  }
}
