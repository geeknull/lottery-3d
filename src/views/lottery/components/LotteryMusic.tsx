import { useState } from 'react'
import { toggleMusic } from '../core/lottery-music'
import './lottery-music.scss'

// 背景音乐按钮：点击播放/暂停。有自定义音乐则放它，否则放内置合成环境音。
// 不自动播放（浏览器会拦截，且现场自动响也不礼貌），由主持人点按开启。
export default function LotteryMusic() {
  const [playing, setPlaying] = useState(false)

  async function toggle() {
    setPlaying(await toggleMusic())
  }

  return (
    <div className="lottery-music">
      <button
        type="button"
        className={'hud-btn music-box' + (playing ? ' playing' : '')}
        title="播放/暂停背景音乐"
        aria-label={playing ? '暂停背景音乐' : '播放背景音乐'}
        aria-pressed={playing}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </button>
    </div>
  )
}
