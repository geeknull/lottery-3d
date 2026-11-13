import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('公证卡浮层的分组指纹与面板一致，可导出 PNG，抽奖后显示红字', async ({ page }, testInfo) => {
  await gotoFresh(page)
  await page.locator('.fairness-btn').click()
  const panelCommit = page.locator('.lottery-fairness .fairness-field code.mono').first()
  await expect(panelCommit).toHaveText(/^[0-9a-f]{64}$/)
  const commit = await panelCommit.textContent()

  await page.getByRole('button', { name: '公证卡', exact: true }).click()
  const card = page.getByRole('dialog', { name: '开抽前公证卡' })
  await expect(card).toBeVisible()
  const groups = await card.locator('.attestation-fingerprint .fp-group').allTextContents()
  expect(groups).toHaveLength(8)
  expect(groups.every(group => /^[0-9a-f]{8}$/.test(group))).toBe(true)
  expect(groups.join('')).toBe(commit)
  await expect(card.locator('.attestation-short strong')).toHaveText(commit!.slice(0, 8))
  await expect(card.locator('.attestation-stage').first()).toHaveText('开抽前')
  await expect(card).toContainText('本机时间，不能作为公布时间的证明')
  await expect(card.locator('.attestation-watermark')).toHaveCount(0)

  const downloaded = page.waitForEvent('download')
  await card.getByRole('button', { name: '导出 PNG', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe(`公证卡-${commit!.slice(0, 8)}.png`)
  const pngPath = testInfo.outputPath('attestation.png')
  await download.saveAs(pngPath)
  const png = await readFile(pngPath)
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.length).toBeGreaterThan(10_000)

  // Escape 只关卡片，面板还在。
  await page.keyboard.press('Escape')
  await expect(card).toHaveCount(0)
  await expect(page.locator('.lottery-fairness')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.lottery-fairness')).toHaveCount(0)

  await drawOneRound(page)
  await closeBanner(page)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '公证卡', exact: true }).click()
  await expect(card.locator('.attestation-stage.drawn')).toHaveCount(2)
  await expect(card.locator('.attestation-stage.drawn').first()).toHaveText('本场已抽 1 轮，此卡不是开抽前凭证')
  await expect(card.locator('.attestation-stage.drawn').first()).toHaveCSS('color', 'rgb(255, 90, 90)')
  expect((await card.locator('.attestation-fingerprint .fp-group').allTextContents()).join('')).toBe(commit)
})

test('彩排页的公证卡带水印', async ({ page }) => {
  await gotoFresh(page)
  await page.goto('/?mode=rehearsal')
  await page.waitForTimeout(3500)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '公证卡', exact: true }).click()
  const card = page.getByRole('dialog', { name: '开抽前公证卡' })
  await expect(card.locator('.attestation-watermark')).toHaveText('彩排，不具效力')
  await expect(card.locator('.attestation-rehearsal-badge')).toHaveText('彩排，不具效力')
  const downloaded = page.waitForEvent('download')
  await card.getByRole('button', { name: '导出 PNG', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toMatch(/^公证卡-彩排-[0-9a-f]{8}\.png$/)
})

test('第一次开始时提醒还没展示公证卡，不阻塞开始；打开过卡片后不提醒', async ({ page }) => {
  const reminder = page.locator('.toast-item', { hasText: '本场还没有展示开抽前公证卡' })
  await gotoFresh(page)
  // 键盘入口：空格开始，提醒出现，同时照常进入旋转。
  await page.keyboard.press(' ')
  await expect(reminder).toBeVisible()
  await expect(page.locator('#primaryCta')).toHaveText('停 !', { timeout: 20000 })
  await page.locator('#primaryCta').click()
  await expect(page.locator('#primaryCta')).toBeEnabled({ timeout: 20000 })
  await closeBanner(page)
  await expect(reminder).toHaveCount(0, { timeout: 8000 })
  await drawOneRound(page)
  await expect(reminder).toHaveCount(0)

  // 新场次先打开公证卡再开始，不提醒。
  await gotoFresh(page)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '公证卡', exact: true }).click()
  await page.getByRole('dialog', { name: '开抽前公证卡' }).getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.lottery-fairness .close-btn').click()
  await page.locator('#primaryCta').click()
  await expect(page.locator('#primaryCta')).toHaveText('停 !', { timeout: 20000 })
  await expect(reminder).toHaveCount(0)
})

test('公平性面板默认隐藏种子，点击后才显示', async ({ page }) => {
  await gotoFresh(page)
  await page.locator('.fairness-btn').click()
  const panel = page.locator('.lottery-fairness')
  // 打开面板会锁定指纹并落盘，之后存档里一定有种子。
  await expect(panel.locator('.fairness-field code.mono').first()).toHaveText(/^[0-9a-f]{64}$/)
  const seed = await page.evaluate(() => JSON.parse(localStorage.getItem('___lottery___')!).seed as number)
  expect(await panel.textContent()).not.toContain(String(seed))
  await expect(panel.locator('.seed-hidden')).toHaveText('已隐藏')
  await expect(panel.locator('.seed-value')).toHaveCount(0)
  await expect(panel.locator('.fairness-warning')).toContainText('种子公开后，本场后续每一轮结果都可以被算出来')
  await expect(panel.locator('.export-hint')).toHaveText('验证数据含种子，活动结束后再分享')
  await panel.getByRole('button', { name: '显示种子', exact: true }).click()
  await expect(panel.locator('.seed-value')).toHaveText(String(seed))
  await panel.getByRole('button', { name: '隐藏种子', exact: true }).click()
  await expect(panel.locator('.seed-value')).toHaveCount(0)
})
