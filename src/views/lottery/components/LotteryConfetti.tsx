import { useEffect, useRef } from 'react'
import { bus } from '../core/event-bus'
import { createBurst, stepParticles } from '../core/lottery-confetti'
import type { ConfettiParticle } from '../core/lottery-confetti'
import { prefersReducedMotion } from '../core/reduced-motion'

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
      // The central stage stays clear of confetti, including the winners' names.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, canvas.width * 0.12, canvas.height)
      ctx.rect(canvas.width * 0.88, 0, canvas.width * 0.12, canvas.height)
      ctx.clip()
      particles.forEach(p => {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = Math.min(1, p.life) // 最后 1 秒淡出
        ctx.fillStyle = p.color
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height)
        ctx.restore()
      })
      ctx.restore()
      if (particles.length > 0) {
        rafId = requestAnimationFrame(frame)
      } else {
        running = false
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    const onReveal = () => {
      if (prefersReducedMotion()) return // 尊重减少动效：不放全屏彩带
      // 粒子数量随屏宽适配，避免小屏过密
      const count = Math.min(72, Math.max(32, Math.round(window.innerWidth / 24)))
      particles = createBurst(canvas.width, canvas.height, count).map(p => ({ ...p, life: Math.min(p.life, 1.25) }))
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
