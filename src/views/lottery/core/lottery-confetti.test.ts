import { describe, it, expect } from 'vitest'
import { createBurst, stepParticles } from './lottery-confetti'

describe('createBurst', () => {
  it('生成指定数量的彩带粒子', () => {
    const particles = createBurst(1000, 800, 80)
    expect(particles).toHaveLength(80)
  })

  it('粒子从屏幕左右两侧底部发射且初速向上', () => {
    const particles = createBurst(1000, 800, 40)
    particles.forEach(p => {
      expect(p.x === 0 || p.x === 1000).toBe(true)
      expect(p.y).toBeGreaterThan(800 * 0.5) // 下半屏发射
      expect(p.vy).toBeLessThan(0) // 向上
      expect(p.life).toBeGreaterThan(0)
    })
    // 左右两边都有
    expect(particles.some(p => p.x === 0)).toBe(true)
    expect(particles.some(p => p.x === 1000)).toBe(true)
  })

  it('左侧粒子向右飞，右侧粒子向左飞', () => {
    const particles = createBurst(1000, 800, 40)
    particles.forEach(p => {
      if (p.x === 0) expect(p.vx).toBeGreaterThan(0)
      else expect(p.vx).toBeLessThan(0)
    })
  })
})

describe('stepParticles', () => {
  it('重力让竖直速度增大、位置随速度积分、寿命减少', () => {
    const [p] = createBurst(1000, 800, 1)
    const before = { x: p.x, y: p.y, vy: p.vy, life: p.life }
    stepParticles([p], 1 / 60)
    expect(p.vy).toBeGreaterThan(before.vy) // 重力向下
    expect(p.x).not.toBe(before.x)
    expect(p.life).toBeLessThan(before.life)
  })

  it('寿命耗尽的粒子被移除', () => {
    const particles = createBurst(1000, 800, 10)
    particles.forEach(p => { p.life = 0.001 })
    const alive = stepParticles(particles, 1 / 60)
    expect(alive).toHaveLength(0)
  })

  it('存活粒子保留', () => {
    const particles = createBurst(1000, 800, 10)
    const alive = stepParticles(particles, 1 / 60)
    expect(alive).toHaveLength(10)
  })
})
