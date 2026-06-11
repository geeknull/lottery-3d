// 中奖揭晓彩带的粒子物理（纯逻辑，canvas 渲染在 LotteryConfetti.tsx）

export interface ConfettiParticle {
  x: number
  y: number
  vx: number
  vy: number
  rotation: number
  rotSpeed: number
  width: number
  height: number
  color: string
  life: number // 剩余寿命（秒）
  wobble: number // 摆动相位，模拟纸片飘动
}

// 与卡片墙青色 + 喜庆金的配色
const COLORS = [
  '#ffd166', '#f4a261', '#ffe8a1', // 金
  '#7fffff', '#4fd8d8', '#a0ffff', // 青
  '#ffffff', '#ff8fa3', // 白、粉
]

const GRAVITY = 900 // px/s²
const LIFE = 3 // 秒

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// 从屏幕左右两侧底部各发射一半彩带，向屏幕中央上方喷射
export function createBurst(width: number, height: number, count: number): ConfettiParticle[] {
  const particles: ConfettiParticle[] = []
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0
    const speed = rand(700, 1300)
    // 喷射角：左侧 -75°~-45°（向右上），右侧对称
    const angle = rand(Math.PI / 4, (Math.PI / 12) * 5)
    particles.push({
      x: fromLeft ? 0 : width,
      y: rand(height * 0.7, height),
      vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      rotation: rand(0, Math.PI * 2),
      rotSpeed: rand(-12, 12),
      width: rand(6, 12),
      height: rand(8, 16),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: rand(LIFE * 0.7, LIFE),
      wobble: rand(0, Math.PI * 2),
    })
  }
  return particles
}

// 推进一帧并返回仍存活的粒子
export function stepParticles(particles: ConfettiParticle[], dt: number): ConfettiParticle[] {
  particles.forEach(p => {
    p.vy += GRAVITY * dt
    p.vx *= 0.99 // 空气阻力
    p.wobble += dt * 8
    p.x += (p.vx + Math.sin(p.wobble) * 30) * dt
    p.y += p.vy * dt
    p.rotation += p.rotSpeed * dt
    p.life -= dt
  })
  return particles.filter(p => p.life > 0)
}
