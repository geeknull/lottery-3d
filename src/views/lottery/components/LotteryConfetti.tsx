import { useEffect, useRef } from 'react'
import { bus } from '../core/event-bus'
import { createBurst, stepParticles } from '../core/lottery-confetti'
import type { ConfettiParticle } from '../core/lottery-confetti'

// 中奖揭晓时的全屏彩带庆祝（canvas 自绘，与 LotteryStarfield 同模式）
export default function LotteryConfetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let particles: ConfettiParticle[] = []
    let rafId = 0
    let lastTime = 0
    let running = false

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const frame = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05) // 页签切走再回来时跳帧保护
      lastTime = time
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles = stepParticles(particles, dt)
      particles.forEach(p => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.min(1, p.life) // 最后 1 秒淡出
        ctx.fillStyle = p.color
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
        ctx.restore()
      })
      if (particles.length > 0) {
        rafId = requestAnimationFrame(frame)
      } else {
        running = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    const onReveal = () => {
      // 粒子数量随屏宽适配，避免小屏过密
      const count = Math.min(180, Math.max(80, Math.round(window.innerWidth / 10)))
      particles.push(...createBurst(canvas.width, canvas.height, count))
      if (!running) {
        running = true
        lastTime = performance.now()
        rafId = requestAnimationFrame(frame)
      }
    }
    bus.on('lottery-win-reveal', onReveal)

    return () => {
      bus.off('lottery-win-reveal', onReveal)
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return <canvas ref={canvasRef} className="lottery-confetti" />
}
