import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('彩排独立抽奖与刷新不会改写正式进度、随机流水或接管正式控制台', async ({ page, context }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  await expect(page.locator('.rehearsal-btn')).toHaveAttribute('href', /\?mode=rehearsal$/)
  const formalProgress = await page.evaluate(() => localStorage.getItem('___lottery___'))
  expect(formalProgress).toBeTruthy()

  const popup = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const control = await popup
  await expect(control.locator('.control-conn')).toHaveText('● 已连接')
  const rehearsal = await context.newPage()
  // Even accidental formal session parameters must not connect this rehearsal.
  const url = new URL(control.url())
  url.searchParams.delete('role')
  url.searchParams.set('mode', 'rehearsal')
  await rehearsal.goto(url.href)
  await expect(rehearsal.locator('.rehearsal-label')).toHaveText('彩排 · 不记录正式结果')
  await expect(rehearsal.locator('.prize-item-count-text').last()).toHaveText('已抽 0/20')
  await expect(rehearsal.locator('.config-btn')).toHaveCount(0)
  await expect(rehearsal.locator('.dual-screen-btn')).toHaveCount(0)
  await expect(rehearsal.locator('.lottery-wrap')).not.toHaveClass(/control-active/)
  await drawOneRound(rehearsal)
  await closeBanner(rehearsal)
  await expect(rehearsal.locator('.prize-item-count-text').last()).toHaveText('已抽 10/20')
  expect(await rehearsal.evaluate(() => localStorage.getItem('___lottery___'))).toBe(formalProgress)
  await expect(control.locator('.control-prize').last().locator('.cp-remain')).toHaveText('剩余 10')

  await rehearsal.reload()
  await expect(rehearsal.locator('.prize-item-count-text').last()).toHaveText('已抽 0/20')
  expect(await rehearsal.evaluate(() => localStorage.getItem('___lottery___'))).toBe(formalProgress)
  await rehearsal.close()
  await control.close()
  await page.reload()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('已抽 10/20')
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('___lottery___')!))
  const previous = JSON.parse(formalProgress!)
  expect(restored.drawLog).toEqual(previous.drawLog)
  expect(restored.rngState).toBe(previous.rngState)
  expect(restored.cardListWinAll).toEqual(previous.cardListWinAll)
})

test('现场检查显示真实缺图、未确认音频与未连接双屏', async ({ page }) => {
  await gotoFresh(page)
  await page.evaluate(() => {
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1, headerTitle: '现场检查',
      prizes: [{ name: '奖品', count: 1, everyTimeGet: 1, img: 'idb:missing-image' }],
      roster: ['甲', '乙'],
    }))
  })
  await page.reload()
  await page.locator('.preflight-btn').click()
  const dialog = page.getByRole('dialog', { name: '现场准备检查' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.preflight-check').filter({ has: page.getByRole('heading', { name: '奖品图与头像' }) })).toContainText('1 / 1 张图片缺失')
  await expect(dialog.locator('.preflight-check').filter({ has: page.getByRole('heading', { name: '音频', exact: true }) })).toContainText('请点击试听')
  await expect(dialog.locator('.preflight-check').filter({ has: page.getByRole('heading', { name: '双屏连接' }) })).toContainText('尚未连接控制台')
  await expect(dialog.locator('.preflight-check').filter({ has: page.getByRole('heading', { name: '离线资源' }) })).toContainText('当前页面未受离线服务控制')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
