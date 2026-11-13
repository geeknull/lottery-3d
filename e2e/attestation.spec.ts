import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('公证卡浮层的分组指纹与面板一致，抽奖后显示红字', async ({ page }) => {
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
})
