import { test, expect } from '@playwright/test'
import { gotoFresh } from './helpers'

test('两个展示页独立，控制窗只控制它配对的展示页', async ({ page, context }) => {
  await gotoFresh(page)
  const other = await context.newPage()
  await other.goto('/')
  await other.waitForTimeout(3500)
  await expect(page.locator('.lottery-wrap')).not.toHaveClass(/control-active/)
  await expect(other.locator('.lottery-wrap')).not.toHaveClass(/control-active/)

  const popup = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const control = await popup
  await expect(control.locator('.control-conn')).toHaveText('● 已连接')
  await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)
  await expect(other.locator('.lottery-wrap')).not.toHaveClass(/control-active/)

  await control.locator('.control-prize').first().click()
  await control.waitForTimeout(2600)
  await control.locator('.control-cta').click()
  await expect(control.locator('.control-cta')).toHaveText('停 !')
  await control.locator('.control-cta').click()
  await expect(control.locator('.control-prize').first().locator('.cp-remain')).toHaveText('剩余 4')
  await expect(other.locator('.prize-item-count-text').first()).toHaveText('已抽 0/5')
  await expect(other.locator('.prize-item-count-text').last()).toHaveText('已抽 0/20')
  await expect(other.locator('.element.prize')).toHaveCount(0)
})

test('未配对的控制地址不会自动接管展示页', async ({ page, context }) => {
  await gotoFresh(page)
  const control = await context.newPage()
  await control.goto('/?mode=control')
  await expect(control.locator('.control-hint')).toContainText('请从展示窗')
  await control.waitForTimeout(3500)
  await expect(control.locator('.control-prize')).toHaveCount(0)
  await expect(page.locator('.lottery-wrap')).not.toHaveClass(/control-active/)
})
