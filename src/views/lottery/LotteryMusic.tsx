import { useEffect } from 'react'
import './lottery-music.scss'

function musicInit() {
  const music: any = document.querySelector('#music')

  let rotated = 0
  let stopAnimate = false
  const musicBox: any = document.querySelector('#musicBox')

  function animate() {
    requestAnimationFrame(function () {
      if (stopAnimate) {
        return
      }
      rotated = rotated % 360
      musicBox.style.transform = 'rotate(' + rotated + 'deg)'
      rotated += 1
      animate()
    })
  }

  musicBox.addEventListener(
    'click',
    function () {
      if (music.paused) {
        music.play().then(
          () => {
            stopAnimate = false
            animate()
          },
          () => {
            console.log('背景音乐自动播放失败，请给权限或手动播放！')
            // alert('背景音乐自动播放失败，请给权限或手动播放！')
          }
        )
      } else {
        music.pause()
        stopAnimate = true
      }
    },
    false
  )

  setTimeout(function () {
    musicBox.click()
  }, 1000)
}

export default function LotteryMusic() {
  useEffect(() => {
    musicInit()
  }, [])

  return (
    <div className="lottery-music">
      {/* http://music.163.com/song/media/outer/url?id=4022088.mp3 */}
      <audio id="music" src="https://music.163.com/song/media/outer/url?id=4022088.mp3" className="music-item" loop></audio>
      <div id="musicBox" className="hud-btn music-box" title="播放/暂停背景音乐">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </div>
    </div>
  )
}
