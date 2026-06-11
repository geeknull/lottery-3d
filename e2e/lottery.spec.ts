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

    await page.locator('#reset').click()
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
    await page.locator('#winShow').click()
    const voidName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    await page.locator('.void-btn').first().click({ force: true })
    await page.locator('.void-confirm-btns button').nth(1).click() // TA 不再参与
    await expect(page.locator('.prize-item-count-text').first()).toHaveText('5/5')
    await page.locator('.show-all-win-user .close-btn').click()

    // 补抽一轮，新中奖人与被作废的人不同
    await drawOneRound(page)
    await closeBanner(page)
    await page.locator('#winShow').click()
    const newName = (await page.locator('.prize-win-user-name').first().textContent())?.replace('✖', '').trim()
    expect(newName).not.toBe(voidName)
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
