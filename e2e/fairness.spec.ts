import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test('完整验证文件可跨场次导入，作废撤销可复算，篡改承诺会失败', async ({ page, browser, baseURL }, testInfo) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)

  await page.getByRole('button', { name: '展示中奖', exact: true }).click()
  await page.locator('.void-btn').first().click()
  await page.locator('.void-confirm-btns button').nth(1).click()
  await page.locator('.show-all-win-user .close-btn').click()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('已抽 0/20')
  await drawOneRound(page)
  await closeBanner(page)

  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '立即自验证', exact: true }).click()
  await expect(page.locator('.verify-result.ok')).toContainText('已复算 2 轮及全部操作')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载验证文件', exact: true }).click()
  const download = await downloaded
  const filePath = testInfo.outputPath('verification.json')
  await download.saveAs(filePath)
  const pkg = JSON.parse(await readFile(filePath, 'utf8'))
  expect(pkg.drawLog.map((entry: { type: string }) => entry.type)).toEqual(['draw', 'void', 'undo', 'draw'])
  expect(pkg.drawLog[0].winnerIds).toHaveLength(10)
  expect(pkg.drawLog[0].poolIds).toHaveLength(pkg.roster.length)
  expect(pkg.finalState.excludedIds).toHaveLength(1)
  expect(pkg.commitmentAlgorithm).toBe('sha256')

  // 新浏览器上下文没有原场次的 localStorage、IndexedDB 或随机种子。
  const independent = await browser.newContext({ baseURL })
  try {
    const verifier = await independent.newPage()
    await gotoFresh(verifier)
    await verifier.locator('.fairness-btn').click()
    await expect(verifier.locator('.lottery-fairness')).toContainText('已记录 0 轮抽奖')
    const fileChooser = verifier.waitForEvent('filechooser')
    await verifier.getByRole('button', { name: '验证文件', exact: true }).click()
    await (await fileChooser).setFiles(filePath)
    await expect(verifier.locator('.verify-result.ok')).toContainText('导入文件验证通过')
    await expect(verifier.locator('.verify-result.ok')).toContainText('已复算 2 轮及全部操作')
    await expect(verifier.locator('.lottery-fairness')).toContainText('已记录 0 轮抽奖')

    pkg.seedCommit = '0'.repeat(64)
    await verifier.locator('.lottery-fairness input[type=file]').setInputFiles({
      name: 'tampered-verification.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(pkg)),
    })
    await expect(verifier.locator('.verify-result.fail')).toContainText('种子与已公布的承诺不一致')
    await verifier.screenshot({ path: testInfo.outputPath('tampered-package-rejected.png') })
  } finally {
    await independent.close()
  }
})

test('旧小数配置两轮抽奖后负余额可复算，刷新仍恢复相同结果', async ({ page }) => {
  await gotoFresh(page)
  await page.locator('.config-btn').click()
  const configChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入配置 JSON', exact: true }).click()
  await (await configChooser).setFiles({
    name: 'legacy-fractional-config.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 1,
      headerTitle: '旧小数配置兼容',
      prizes: [{ name: '兼容奖', count: 1.5, everyTimeGet: 1 }],
      roster: ['甲', '乙', '丙'],
      avatarStyle: 'initials',
    })),
  })
  await expect(page.locator('.title-input')).toHaveValue('旧小数配置兼容')
  await page.locator('.panel-actions button.primary').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.lottery-header')).toHaveText('旧小数配置兼容')
  await page.waitForTimeout(3500)

  await drawOneRound(page)
  await closeBanner(page)
  await expect(page.locator('.prize-item-count-text')).toHaveText('已抽 1/1.5')
  await drawOneRound(page)
  await closeBanner(page)
  await expect(page.locator('.prize-item-count-text')).toHaveText('已抽 2/1.5')
  await expect(page.locator('.element.prize')).toHaveCount(2)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '立即自验证', exact: true }).click()
  await expect(page.locator('.verify-result.ok')).toContainText('已复算 2 轮及全部操作')

  await page.reload()
  await expect(page.locator('.prize-item-count-text')).toHaveText('已抽 2/1.5')
  await expect(page.locator('.element.prize')).toHaveCount(2)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '立即自验证', exact: true }).click()
  await expect(page.locator('.verify-result.ok')).toContainText('已复算 2 轮及全部操作')
})
