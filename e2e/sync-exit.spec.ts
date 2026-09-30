import { test, expect } from '@playwright/test'
import { gotoFresh } from './helpers'

test('退出双屏后立即重新配对会再次隐藏主屏操作', async ({ page }) => {
  await gotoFresh(page)
  let opened = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const first = await opened
  await expect(first.locator('.control-conn')).toHaveText('● 已连接')
  await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)

  await page.locator('.exit-dual-btn').click()
  await expect(page.locator('.lottery-wrap')).not.toHaveClass(/control-active/)
  opened = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const second = await opened
  await expect(second.locator('.control-conn')).toHaveText('● 已连接')
  // 不等待 8 秒超时；新控制窗连上后，主屏应立即恢复投影模式。
  await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)
})

test('退出双屏会让复制的旧控制页失效，新配对不接受旧页操作', async ({ page, context }) => {
  await gotoFresh(page)
  let opened = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const original = await opened
  await expect(original.locator('.control-conn')).toHaveText('● 已连接')
  const copied = await context.newPage()
  await copied.goto(original.url())
  await expect(copied.locator('.control-conn')).toHaveText('● 已连接')

  await page.locator('.exit-dual-btn').click()
  opened = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const current = await opened
  await expect(current.locator('.control-conn')).toHaveText('● 已连接')
  // 旧页即使在断连超时前仍显示“已连接”，也不能再向新配对发出有效命令。
  await copied.locator('.control-prize').first().click()
  await expect(current.locator('.control-prize').last()).toHaveClass(/selected/)
  await expect(copied.locator('.control-conn')).toHaveText('○ 已断开', { timeout: 12_000 })
  await expect(copied.locator('.control-cta')).toBeDisabled()
  await expect(current.locator('.control-prize').last()).toHaveClass(/selected/)
  await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)
})
