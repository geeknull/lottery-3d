import { test, expect } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

test.describe('抽奖核心流程', () => {
  test('抽奖后剩余数量减少、卡片中奖染色、横幅展示', async ({ page }) => {
    await gotoFresh(page)
    // 默认选中最后一个奖项（三等奖，每轮 10 人）
    const countBefore = await page.locator('.prize-item-count-text').last().textContent()
    expect(countBefore).toBe('20/20')

    await drawOneRound(page)

    // 揭晓横幅出现且有 10 个中奖人
    await expect(page.locator('.lottery-win-banner')).toBeVisible()
    await expect(page.locator('.banner-winner')).toHaveCount(10)
    await closeBanner(page)

    // 剩余数量与中奖染色同步
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)
  })

  test('刷新后抽奖进度恢复', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')

    await page.reload()
    await page.waitForTimeout(3500)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)
  })

  test('重置数据走界面确认框并清空进度', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)

    // 重置入口已移入配置面板（避免现场误点）
    await page.locator('.config-btn').click()
    await page.locator('.panel-actions .danger').click()
    await expect(page.locator('.confirm-dialog')).toBeVisible()
    await page.locator('.confirm-btns button.primary').click()
    await page.waitForTimeout(3500)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
  })
})

test.describe('中奖作废与补抽', () => {
  test('作废中奖名额退回，可补抽出新的人', async ({ page }) => {
    await gotoFresh(page)
    // 用特等奖（每轮 1 人）便于断言
    await page.locator('.prize-item').first().click()
    await page.waitForTimeout(2600)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').first()).toHaveText('4/5')

    // 打开中奖名单作废（不退回奖池）
    await page.locator('.icon-action:has-text("展示中奖")').click()
    const voidName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    await page.locator('.void-btn').first().click({ force: true })
    await page.locator('.void-confirm-btns button').nth(1).click() // TA 不再参与
    await expect(page.locator('.prize-item-count-text').first()).toHaveText('5/5')
    await page.locator('.show-all-win-user .close-btn').click()

    // 补抽一轮，新中奖人与被作废的人不同
    await drawOneRound(page)
    await closeBanner(page)
    await page.locator('.icon-action:has-text("展示中奖")').click()
    const newName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    expect(newName).not.toBe(voidName)
  })
})

test.describe('可验证公平与历史', () => {
  test('抽奖后公平性面板自验证通过，历史记录该轮', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)

    // 公平性自验证
    await page.locator('.fairness-btn').click()
    await page.locator('button:has-text("立即自验证")').click()
    await expect(page.locator('.verify-result.ok')).toBeVisible()
    await page.locator('.lottery-fairness .close-btn').click()

    // 历史时间线记录了这一轮抽奖
    await page.locator('.history-btn').click()
    await expect(page.locator('.history-item.type-draw')).toHaveCount(1)
  })
})

test.describe('撤销整轮', () => {
  test('撤销后名额退回、卡片去染色', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    await expect(page.locator('.element.prize')).toHaveCount(10)

    await page.locator('.icon-action:has-text("撤销")').click()
    await page.locator('.confirm-btns button.primary').click()
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
    await expect(page.locator('.element.prize')).toHaveCount(0)
  })
})

test.describe('快捷键与主题', () => {
  test('空格控制开始/停止抽奖', async ({ page }) => {
    await gotoFresh(page)
    await page.keyboard.press('Space')
    await page.waitForTimeout(2200)
    await page.keyboard.press('Space')
    await page.waitForTimeout(3000)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
  })

  test('切换主题改变 data-theme 并持久化', async ({ page }) => {
    await gotoFresh(page)
    await page.locator('.config-btn').click()
    await page.locator('.theme-option.theme-festive').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'festive')

    await page.locator('.lottery-config-panel .close-btn').click()
    await page.reload()
    await page.waitForTimeout(2000)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'festive')
  })
})

test.describe('双屏控制', () => {
  test('控制窗遥控展示窗完成一轮抽奖', async ({ page, context }) => {
    await gotoFresh(page)

    // 开控制窗（同 context 同源，BroadcastChannel 互通）
    const control = await context.newPage()
    await control.goto('/?mode=control')
    await control.waitForTimeout(2500)

    // 连上：已连接 + 奖项列表 + 展示窗自动隐藏操作 UI
    await expect(control.locator('.control-conn')).toHaveText('● 已连接')
    await expect(control.locator('.control-prize')).toHaveCount(4)
    await expect(page.locator('.lottery-wrap')).toHaveClass(/control-active/)

    // 控制窗选三等奖 → 开始（按钮镜像 spinning）→ 停
    await control.locator('.control-prize').nth(3).click()
    await control.waitForTimeout(3000)
    await control.locator('.control-cta').click()
    await control.waitForFunction(
      () => document.querySelector('.control-cta')?.textContent?.includes('停'),
      { timeout: 8000 },
    )
    await control.locator('.control-cta').click()

    // 中奖名单回传控制窗 + 剩余数同步
    await expect(control.locator('.control-reveal .cr-title')).toHaveText('最近中奖 · 三等奖', { timeout: 12000 })
    await expect(control.locator('.control-prize').nth(3).locator('.cp-remain')).toHaveText('10/20')

    // 关闭控制窗 → 展示窗恢复操作 UI
    await control.close()
    await expect(page.locator('.lottery-wrap')).not.toHaveClass(/control-active/, { timeout: 12000 })
  })
})
