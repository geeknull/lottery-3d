import { test, expect, type Page } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

const savedDraws = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('___lottery___')!) as { drawLog: unknown[] }).drawLog.length)

test('过期窗口被阻止，不会重复抽取或覆盖正式进度', async ({ page, context }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)

  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('#primaryCta')).toHaveText('开始抽奖', { timeout: 20000 })

  await page.bringToFront()
  await drawOneRound(page)
  await closeBanner(page)
  expect(await savedDraws(page)).toBe(2)

  await other.bringToFront()
  const notice = other.getByRole('dialog', { name: '此窗口的进度已过期' })
  await expect(notice).toBeVisible()
  await other.keyboard.press(' ')
  await other.waitForTimeout(500)
  expect(await savedDraws(other)).toBe(2)

  await notice.getByRole('button', { name: '刷新并载入最新进度' }).click()
  await expect(other.locator('.prize-item-count-text').last()).toHaveText('已抽 20/20')
  await expect(other.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)
})

test('彩排窗口不受影响，也不会让正式窗口过期', async ({ page, context }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)

  const rehearsal = await context.newPage()
  await rehearsal.goto('/?mode=rehearsal')
  await drawOneRound(rehearsal)
  await expect(rehearsal.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)

  await page.bringToFront()
  await expect(page.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)
})
