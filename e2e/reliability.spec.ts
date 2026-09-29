import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('作废后撤销整轮不会重复归还名额，刷新后结果一致', async ({ page }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  await page.locator('.icon-action:has-text("展示中奖")').click()
  await page.locator('.void-btn').first().click()
  await page.locator('.void-confirm-btns button').nth(1).click()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('11/20')
  await page.locator('.show-all-win-user .close-btn').click()
  await page.locator('.icon-action:has-text("撤销")').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
  await expect(page.locator('.element.prize')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
  await expect(page.locator('.element.prize')).toHaveCount(0)
})

test('新配置保存失败保留既有中奖进度，重试成功才应用新配置', async ({ page }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  const original = await page.evaluate(() => localStorage.getItem('___lottery___'))
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === '___lottery_config___') {
        Storage.prototype.setItem = originalSetItem
        throw new DOMException('quota', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    }
  })
  await page.locator('.config-btn').click()
  await page.locator('.title-input').fill('新活动')
  await page.locator('.panel-actions button.primary').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.getByText(/配置保存失败/)).toBeVisible()
  expect(await page.evaluate(raw => localStorage.getItem('___lottery___') === raw, original)).toBe(true)
  await page.reload()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
  await page.locator('.config-btn').click()
  await page.locator('.title-input').fill('新活动')
  await page.locator('.panel-actions button.primary').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
  await expect(page.locator('.lottery-config-panel')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('___lottery_config___')!).headerTitle)).toBe('新活动')
})

test('奖品图片写入失败保留原配置与进度，并恢复保存按钮', async ({ page }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  const original = await page.evaluate(() => localStorage.getItem('___lottery___'))
  await page.locator('.config-btn').click()
  await page.locator('.title-input').fill('图片保存失败的新活动')
  await page.locator('.prize-img-upload input').first().setInputFiles({
    name: 'prize.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>'),
  })
  await expect(page.locator('.prize-img-thumb').first()).toBeVisible()
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function() { throw new DOMException('quota', 'QuotaExceededError') }
  })
  await page.locator('.panel-actions button.primary').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.getByText(/配置保存失败/)).toBeVisible()
  await expect(page.locator('.panel-actions button.primary')).toBeEnabled()
  expect(await page.evaluate(raw => localStorage.getItem('___lottery___') === raw, original)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('___lottery_config___'))).toBeNull()
  await page.reload()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
})
