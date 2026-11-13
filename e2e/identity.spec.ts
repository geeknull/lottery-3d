import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import { gotoFresh, drawOneRound } from './helpers'

// 名单身份列（工号、部门），见 plans/018。
const ROSTER = '姓名,工号,部门\n张伟,A001,研发部\n张伟,A002,市场部\n李娜,A003,行政部'

// 通过配置面板粘贴带表头的名单并保存：一个奖项 3 个名额，一轮全部抽出。
async function applyIdentityRoster(page: Page) {
  await gotoFresh(page)
  await page.locator('.config-btn').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '导入配置 JSON', exact: true }).click()
  await (await chooser).setFiles({
    name: 'identity.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 1, headerTitle: '身份列', avatarStyle: 'letter',
      prizes: [{ name: '一等奖', count: 3, everyTimeGet: 3 }],
      roster: ['占位1', '占位2', '占位3'],
    })),
  })
  // 导入是异步的：等面板载入导入的配置后再粘贴名单，否则导入结果会覆盖粘贴的内容
  await expect(page.locator('.title-input')).toHaveValue('身份列')
  await page.locator('.lottery-config-panel textarea').fill(ROSTER)
  await page.locator('.panel-actions button.primary').click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.lottery-header')).toHaveText('身份列')
  await page.waitForTimeout(3500)
}

test('两个张伟带不同工号：卡片显示工号，揭晓横幅只对重名者加后缀', async ({ page }, testInfo) => {
  await applyIdentityRoster(page)
  await expect(page.locator('.element[data-card-id="张伟-2"] .details')).toHaveText('A002')
  await expect(page.locator('.element[data-card-id="李娜"] .details')).toHaveText('A003')

  await drawOneRound(page)
  const winners = page.locator('.lottery-win-banner .banner-winner')
  await expect(winners).toHaveCount(3)
  expect((await winners.allTextContents()).sort()).toEqual(['张伟（A001）', '张伟（A002）', '李娜'].sort())
  await page.screenshot({ path: testInfo.outputPath('identity-banner.png') })

  // 中奖名单面板（作废入口）同样只对重名者加后缀
  await page.locator('.lottery-win-banner').click()
  await page.getByRole('button', { name: '展示中奖', exact: true }).click()
  const names = page.locator('.prize-win-user-name')
  await expect(names).toHaveCount(3)
  expect((await names.allTextContents()).map(text => text.replace('✖', '')).sort()).toEqual(['张伟（A001）', '张伟（A002）', '李娜'].sort())
  await page.locator('.show-all-win-user .close-btn').click()

  // 刷新后进度照常恢复（带工号的指纹前后一致）
  await page.reload()
  await expect(page.locator('.element.prize')).toHaveCount(3)
})

test('导出中奖名单 CSV 与抽奖流水 CSV 带工号、部门列', async ({ page }, testInfo) => {
  await applyIdentityRoster(page)
  await drawOneRound(page)
  await page.locator('.lottery-win-banner').click()

  await page.locator('.config-btn').click()
  const winnersDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出中奖名单 CSV', exact: true }).click()
  const winnersPath = testInfo.outputPath('winners.csv')
  await (await winnersDownload).saveAs(winnersPath)
  const winners = (await readFile(winnersPath, 'utf8')).replace('﻿', '').split('\n')
  expect(winners[0]).toBe('奖项,姓名,工号,部门')
  expect(winners.slice(1).sort()).toEqual(['一等奖,张伟,A001,研发部', '一等奖,张伟,A002,市场部', '一等奖,李娜,A003,行政部'])
  await page.locator('.lottery-config-panel .close-btn').click()

  await page.locator('.history-btn').click()
  const historyDownload = page.waitForEvent('download')
  await page.locator('.export-btn').click()
  const historyPath = testInfo.outputPath('history.csv')
  await (await historyDownload).saveAs(historyPath)
  const history = (await readFile(historyPath, 'utf8')).replace('﻿', '').split('\n')
  expect(history[0]).toBe('时间,操作,奖项,姓名,备注,工号,部门')
  expect(history.slice(1).map(line => line.split(',').slice(1).join(',')).sort())
    .toEqual(['抽奖,一等奖,张伟,,A001,研发部', '抽奖,一等奖,张伟,,A002,市场部', '抽奖,一等奖,李娜,,A003,行政部'])
})

test('名单提示重复工号与多列无表头；修改工号触发清空确认并写清后果', async ({ page }, testInfo) => {
  await applyIdentityRoster(page)
  await drawOneRound(page)
  await page.locator('.lottery-win-banner').click()

  await page.locator('.config-btn').click()
  const textarea = page.locator('.lottery-config-panel textarea')
  await expect(textarea).toHaveValue(ROSTER)

  await textarea.fill('张伟,研发部\n李娜,市场部\n王五')
  await expect(page.locator('.roster-warning')).toHaveText('检测到多列内容但没有表头，附加列被忽略；首行加上「姓名,部门」可启用')

  await textarea.fill('姓名,工号,部门\n张伟,A001,研发部\n张伟,A001,市场部\n李娜,A003,行政部')
  await expect(page.locator('.roster-warning')).toHaveText('工号 A001 重复 2 处，请核对（不影响保存）')
  await expect(page.locator('.apply-impact')).toContainText('改动了：工号')
  await page.screenshot({ path: testInfo.outputPath('identity-panel-hints.png') })

  // 只改部门：保留进度，不弹确认
  await textarea.fill('姓名,工号,部门\n张伟,A001,总裁办\n张伟,A002,市场部\n李娜,A003,行政部')
  await expect(page.locator('.apply-impact')).toHaveText('当前名单与奖项规则未变，保存后保留中奖进度。')

  // 修正工号：确认框写清会清空什么、为什么
  await textarea.fill('姓名,工号,部门\n张伟,A001,研发部\n张伟,A009,市场部\n李娜,A003,行政部')
  await page.locator('.panel-actions button.primary').click()
  const message = page.locator('.confirm-message')
  await expect(message).toContainText('已抽出的 3 位中奖者和 1 条抽奖流水')
  await expect(message).toContainText('工号有改动')
  await expect(message).toContainText('工号参与配置指纹，用来区分同名的人')
  await page.screenshot({ path: testInfo.outputPath('identity-reset-confirm.png') })
  await page.locator('.confirm-btns button').nth(1).click()
  await expect(page.locator('.confirm-message')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.element.prize')).toHaveCount(3)
})
