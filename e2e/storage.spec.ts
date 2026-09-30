import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('含奖品图的抽奖保存轻量进度，刷新仍恢复中奖和图片', async ({ page }) => {
  await gotoFresh(page)
  await page.locator('.config-btn').click()
  await page.locator('.prize-img-upload input').last().setInputFiles({
    name: 'prize.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'),
  })
  await expect(page.locator('.prize-img-thumb').last()).toBeVisible()
  await page.locator('.panel-actions button.primary').click()
  await expect(page.locator('.lottery-config-panel')).toHaveCount(0)
  await page.waitForTimeout(3500)
  await drawOneRound(page)
  await closeBanner(page)
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('___lottery___')!
    return { length: raw.length, containsImage: raw.includes('data:image'), saved: JSON.parse(raw) }
  })
  expect(stored.containsImage).toBe(false)
  expect(stored.length).toBeLessThan(100_000)
  expect(stored.saved.version).toBe(2)
  expect(stored.saved.cardListWinAll).toHaveLength(10)
  await page.reload()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('已抽 10/20')
  await expect(page.locator('.element.prize')).toHaveCount(10)
  await expect(page.locator('.prize-item img').last()).toHaveAttribute('src', /^data:image/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('___lottery___')!).cardListWinAll)).toEqual(stored.saved.cardListWinAll)
})
