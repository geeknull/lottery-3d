// A small Canvas depth field; the result frame is deliberately still.
import { useEffect } from 'react'
import { prefersReducedMotion } from '../core/reduced-motion'
import STATUS from '../core/lottery-status'

interface Star { x: number; y: number; z: number }

function startStarfield(): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = 'lottery-depth-field'
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '-1', pointerEvents: 'none' })
  document.body.appendChild(canvas)
  const context = canvas.getContext('2d')!
  let stars: Star[] = []
  let rafId = 0
  let stopped = false
  let last = 0
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  function resize() {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      z: 80 + Math.random() * canvas.width,
    }))
    draw(0)
  }
  function draw(delta: number) {
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    const phase = STATUS.getPhase()
    const speed = phase === 'spinning' ? .018 : .003
    context.fillStyle = '#000a14'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = phase === 'presenting' ? 'rgba(160,218,225,.18)' : 'rgba(160,218,225,.42)'
    for (const star of stars) {
      star.z -= delta * speed
      if (star.z < 60) star.z = canvas.width
      const perspective = canvas.width / star.z
      const x = (star.x - centerX) * perspective + centerX
      const y = (star.y - centerY) * perspective + centerY
      if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) continue
      context.beginPath()
      context.arc(x, y, Math.min(1.5, perspective * .55), 0, Math.PI * 2)
      context.fill()
    }
  }
  function frame(now: number) {
    if (stopped) return
    const elapsed = now - last
    if (elapsed >= 32) {
      draw(Math.min(elapsed, 50))
      last = now
    }
    rafId = requestAnimationFrame(frame)
  }
  function syncMotion() {
    cancelAnimationFrame(rafId)
    draw(0)
    if (!prefersReducedMotion() && STATUS.getPhase() !== 'presenting') {
      last = performance.now()
      rafId = requestAnimationFrame(frame)
    }
  }
  resize()
  syncMotion()
  const unsubscribe = STATUS.subscribe(syncMotion)
  media?.addEventListener('change', syncMotion)
  window.addEventListener('resize', resize)
  return () => {
    stopped = true
    cancelAnimationFrame(rafId)
    unsubscribe()
    media?.removeEventListener('change', syncMotion)
    window.removeEventListener('resize', resize)
    canvas.remove()
  }
}

export default function LotteryStarfield() {
  useEffect(() => startStarfield(), [])
  return null
}
