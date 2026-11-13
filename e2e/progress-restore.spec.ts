import { test, expect, type Page } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

const INIT_WAIT = 3500

async function downloadVerification(page: Page, path: string) {
  await page.locator('.fairness-btn').click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载验证文件', exact: true }).click()
  await (await downloaded).saveAs(path)
  await page.locator('.lottery-fairness .close-btn').click()
}

async function prizeCounts(page: Page) {
  return page.locator('.prize-item-count-text').allTextContents()
}

// 在公平性面板选择验证文件恢复。不点确认，留给调用方检查确认框。
async function chooseRestoreFile(page: Page, path: string) {
  await page.locator('.fairness-btn').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '从验证文件恢复进度', exact: true }).click()
  await (await chooser).setFiles(path)
  await expect(page.locator('.confirm-dialog')).toBeVisible()
}

test('换新浏览器上下文恢复后继续抽奖仍可验证；覆盖已有进度时红字确认并留底', async ({ page, browser, baseURL }, testInfo) => {
  // 原场次：抽两轮，其间作废一人（不再参与）。
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  await page.getByRole('button', { name: '展示中奖', exact: true }).click()
  await page.locator('.void-btn').first().click()
  await page.locator('.void-confirm-btns button').nth(1).click()
  await page.locator('.show-all-win-user .close-btn').click()
  await drawOneRound(page)
  await closeBanner(page)
  const originalCounts = await prizeCounts(page)
  const twoRounds = testInfo.outputPath('two-rounds.json')
  await downloadVerification(page, twoRounds)

  // 新的浏览器上下文：没有原场次的 localStorage、IndexedDB 和种子。
  const fresh = await browser.newContext({ baseURL, acceptDownloads: true })
  try {
    const stage = await fresh.newPage()
    await gotoFresh(stage)
    await chooseRestoreFile(stage, twoRounds)
    await expect(stage.locator('.confirm-message')).toContainText('备份：2 轮')
    await expect(stage.locator('.confirm-message')).toContainText('当前：0 轮、0 人中奖')
    await expect(stage.locator('.confirm-warning')).toHaveCount(0)
    await stage.screenshot({ path: testInfo.outputPath('restore-confirm-empty.png') })
    await Promise.all([stage.waitForEvent('load'), stage.getByRole('button', { name: '恢复并刷新', exact: true }).click()])
    await stage.waitForTimeout(INIT_WAIT)
    expect(await prizeCounts(stage)).toEqual(originalCounts)
    expect(await stage.evaluate(() => localStorage.getItem('___lottery_rejected___'))).toBeNull()

    // 恢复后接着抽一轮，整场仍然能复算。
    await drawOneRound(stage)
    await closeBanner(stage)
    await stage.locator('.fairness-btn').click()
    await expect(stage.locator('.lottery-fairness')).toContainText('已记录 3 轮抽奖')
    await stage.getByRole('button', { name: '立即自验证', exact: true }).click()
    await expect(stage.locator('.verify-result.ok')).toContainText('已复算 3 轮及全部操作')
    await stage.locator('.lottery-fairness .close-btn').click()

    // 已有 3 轮时用 2 轮的旧备份恢复：红字写明替换和丢失轮数，按钮换成专用文案。
    const replacedRaw = await stage.evaluate(() => localStorage.getItem('___lottery___'))
    await chooseRestoreFile(stage, twoRounds)
    await expect(stage.locator('.confirm-warning')).toContainText('当前场次已有 3 轮')
    await expect(stage.locator('.confirm-warning')).toContainText('备份比当前场次少 1 轮，这 1 轮的结果会丢失')
    await stage.screenshot({ path: testInfo.outputPath('restore-confirm-replace.png') })
    await Promise.all([stage.waitForEvent('load'), stage.getByRole('button', { name: '替换当前进度并刷新', exact: true }).click()])
    await stage.waitForTimeout(INIT_WAIT)
    expect(await prizeCounts(stage)).toEqual(originalCounts)
    const rejected = JSON.parse((await stage.evaluate(() => localStorage.getItem('___lottery_rejected___')))!)
    expect(rejected.reason).toBe('replaced-by-restore')
    expect(rejected.raw).toBe(replacedRaw)
    // 留底不是“启动时被拒绝”，不能弹旧进度被拒绝的提醒。
    await expect(stage.locator('.toast-item')).toHaveCount(0)
    await stage.locator('.config-btn').click()
    await expect(stage.getByRole('button', { name: '导出未恢复的旧进度', exact: true })).toBeVisible()
  } finally {
    await fresh.close()
  }
})

test('另一个正式窗口恢复后，本窗口进入过期状态，强行恢复也被拒绝', async ({ page, context }, testInfo) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  const backup = testInfo.outputPath('backup.json')
  await downloadVerification(page, backup)

  const other = await context.newPage()
  await other.goto('/')
  await other.waitForTimeout(INIT_WAIT)
  await other.locator('.fairness-btn').click()

  await chooseRestoreFile(page, backup)
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: '替换当前进度并刷新', exact: true }).click()])
  await expect(other.locator('.lottery-stale-notice')).toBeVisible()

  // 过期窗口被遮罩挡住；绕过遮罩直接选文件，写入流程同样拒绝，存储不变。
  const stored = await other.evaluate(() => localStorage.getItem('___lottery___'))
  await other.locator('.lottery-fairness .restore-input').setInputFiles(backup)
  await other.locator('.confirm-btns button.primary').click()
  await expect(other.locator('.restore-result')).toHaveText('没有恢复：其他窗口已更新进度，请关闭其他正式窗口后刷新页面再试')
  expect(await other.evaluate(() => localStorage.getItem('___lottery___'))).toBe(stored)
})

test('当前名单和备份不同时拒绝恢复并指出差异，不弹确认', async ({ page }, testInfo) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  const backup = testInfo.outputPath('backup.json')
  await downloadVerification(page, backup)

  await page.evaluate(() => {
    localStorage.removeItem('___lottery___')
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1, headerTitle: '另一场', prizes: [{ name: '大奖', count: 1, everyTimeGet: 1 }], roster: ['甲', '乙', '丙'],
    }))
  })
  await page.reload()
  await page.waitForTimeout(INIT_WAIT)
  await page.locator('.fairness-btn').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '从验证文件恢复进度', exact: true }).click()
  await (await chooser).setFiles(backup)
  await expect(page.locator('.restore-result')).toContainText('备份里的名单和当前名单不一致')
  await expect(page.locator('.restore-result')).toContainText('请先导入这份备份对应的配置')
  await expect(page.locator('.confirm-dialog')).toHaveCount(0)
  // 打开面板会生成并保存承诺，但不能写入备份里的任何结果。
  const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('___lottery___')))!)
  expect(stored.drawLog).toEqual([])
  expect(stored.cardListWinAll).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('restore-rejected-roster.png') })
})

test('奖项抽完后底部提醒下载验证文件，下载后收起，刷新后不再提醒', async ({ page }, testInfo) => {
  await gotoFresh(page)
  await page.evaluate(() => {
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1, headerTitle: '备份提醒', prizes: [{ name: '大奖', count: 2, everyTimeGet: 2 }], roster: ['甲', '乙', '丙', '丁', '戊'],
    }))
  })
  await page.reload()
  await page.waitForTimeout(INIT_WAIT)
  await expect(page.locator('.lottery-backup-reminder')).toHaveCount(0)
  await drawOneRound(page)
  const reminder = page.locator('.lottery-backup-reminder')
  await expect(reminder).toContainText('「大奖」已抽完')
  await page.waitForTimeout(500) // 等入场动画结束再截图
  await page.screenshot({ path: testInfo.outputPath('backup-reminder.png') })
  const downloaded = page.waitForEvent('download')
  await reminder.getByRole('button', { name: '下载验证文件', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('抽奖验证.json')
  await expect(reminder).toHaveCount(0)

  await page.reload()
  await page.waitForTimeout(INIT_WAIT)
  await expect(page.locator('.lottery-backup-reminder')).toHaveCount(0)
})
