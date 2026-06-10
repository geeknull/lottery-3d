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
      <div id="musicBox" className="music-box" title="播放/暂停背景音乐">Music</div>
    </div>
  )
}
