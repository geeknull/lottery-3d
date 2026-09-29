import { test, expect } from '@playwright/test'
import { gotoFresh } from './helpers'

test('真实卡片反复切换布局后，完成的动画不留在每帧更新队列', async ({ page }) => {
  await gotoFresh(page)
  const result = await page.evaluate(async () => {
    const groupPath = '/src/views/lottery/3d/tween-group.ts'
    const animationPath = '/src/views/lottery/3d/3d-animate.ts'
    const { tweenGroup } = await import(groupPath)
    const { transform } = await import(animationPath)
    for (let i = 0; i < 10; i++) await transform(i % 2 ? 'grid' : 'helix', 0)
    return { cards: document.querySelectorAll('.element').length, tweens: tweenGroup.getAll().length }
  })
  expect(result.cards).toBe(300)
  expect(result.tweens).toBe(0)
})
