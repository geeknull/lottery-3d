// https://github.com/moshang-xc/lottery
import { useEffect } from 'react'
import { prefersReducedMotion } from '../core/reduced-motion'

interface Star {
  x: number;
  y: number;
  z: number;
}

// 创建星空画布并启动动画，返回清理函数（停止 rAF + 移除画布）。
// 供 useEffect 卸载 / StrictMode 双调用时干净拆除，避免多个画布与 rAF 循环叠加泄漏。
function startStarfield(): () => void {
  const canvasBox = document.createElement('div')
  canvasBox.style.position = 'fixed'
  canvasBox.style.top = '0'
  canvasBox.style.left = '0'
  canvasBox.style.zIndex = '-1'
  const canvas = document.createElement('canvas')
  canvasBox.appendChild(canvas)
  document.body.appendChild(canvasBox)

  const c = canvas.getContext('2d')!
  const numStars = 1000
  const radius = 1
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  const focalLength = canvas.width
  let centerX = canvas.width / 2
  let centerY = canvas.height / 2
  let stars: Star[] = []
  let rafId = 0
  let stopped = false

  function initializeStars() {
    centerX = canvas.width / 2
    centerY = canvas.height / 2
    stars = []
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * canvas.width,
      })
    }
  }

  function moveStars() {
    for (let i = 0; i < numStars; i++) {
      const star = stars[i]
      star.z--
      if (star.z <= 0) {
        star.z = canvas.width
      }
    }
  }

  function drawStars() {
    // Resize to the screen
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initializeStars()
    }

    c.fillStyle = 'rgba(0,10,20,1)'
    c.fillRect(0, 0, canvas.width, canvas.height)
    c.fillStyle = 'rgba(209, 255, 255, ' + radius + ')'
    for (let i = 0; i < numStars; i++) {
      const star = stars[i]
      const pixelX = (star.x - centerX) * (focalLength / star.z) + centerX
      const pixelY = (star.y - centerY) * (focalLength / star.z) + centerY
      const pixelRadius = radius * (focalLength / star.z)
      c.beginPath()
      c.arc(pixelX, pixelY, pixelRadius, 0, 2 * Math.PI)
      c.fill()
    }
  }

  function executeFrame() {
    if (stopped) {
      return
    }
    // 尊重减少动效：只画一帧静态星空，不做连续「穿越」动画
    if (prefersReducedMotion()) {
      drawStars()
      return
    }
    rafId = requestAnimationFrame(executeFrame)
    moveStars()
    drawStars()
  }

  initializeStars()
  executeFrame()

  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
    canvasBox.remove()
  }
}

export default function LotteryStarfield() {
  useEffect(() => startStarfield(), [])
  return <div className="empty"></div>
}
