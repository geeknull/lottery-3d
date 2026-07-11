// 背景音乐播放控制：有自定义音乐则循环播放它，否则用 Web Audio 合成一段
// 轻柔的五声音阶环境音（零音频文件、可离线）。全部失败一律静默（音乐非关键功能）。

import { hasCustomMusic, getMusic } from './lottery-music-store'

interface SynthHandle {
  stop(): void
}

// C 大调五声音阶（含高八度），任意顺序都不刺耳，适合做无限循环的环境音
const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33]

// 启动合成环境音：每隔一拍取音阶里下一个音，用柔和正弦 + 长释放，整体低音量。
function startSynth(): SynthHandle | null {
  let ctx: AudioContext
  try {
    ctx = new AudioContext()
  } catch {
    return null
  }
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  const master = ctx.createGain()
  master.gain.value = 0.05 // 背景音，压低
  master.connect(ctx.destination)

  let i = 0
  const timer = window.setInterval(() => {
    const freq = PENTATONIC[i % PENTATONIC.length]
    i++
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(g)
    g.connect(master)
    const t = ctx.currentTime
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(1, t + 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
    osc.start(t)
    osc.stop(t + 1.7)
  }, 560)

  return {
    stop() {
      clearInterval(timer)
      try {
        master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
      } catch {
        /* 忽略 */
      }
      window.setTimeout(() => {
        try {
          void ctx.close()
        } catch {
          /* 忽略 */
        }
      }, 400)
    },
  }
}

let audioEl: HTMLAudioElement | null = null
let synth: SynthHandle | null = null
let playing = false

export function isMusicPlaying(): boolean {
  return playing
}

// 开始播放：优先自定义音乐（循环），失败或无自定义则退回合成环境音。
export async function startMusic(): Promise<void> {
  if (playing) {
    return
  }
  if (hasCustomMusic()) {
    try {
      const data = await getMusic()
      if (data) {
        if (!audioEl) {
          audioEl = new Audio()
          audioEl.loop = true
        }
        audioEl.src = data
        await audioEl.play()
        playing = true
        return
      }
    } catch {
      // 自定义音乐播放失败（格式不支持/自动播放被拦），退回合成音
    }
  }
  synth = startSynth()
  playing = synth != null
}

export function stopMusic(): void {
  if (audioEl) {
    audioEl.pause()
  }
  if (synth) {
    synth.stop()
    synth = null
  }
  playing = false
}

// 切换播放/暂停，返回切换后的播放状态
export async function toggleMusic(): Promise<boolean> {
  if (playing) {
    stopMusic()
  } else {
    await startMusic()
  }
  return playing
}
