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
