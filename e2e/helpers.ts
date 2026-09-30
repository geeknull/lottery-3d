import { expect, type Page } from '@playwright/test'

// 3D 初始化是异步的（卡片从随机位飞到 table），给足时间
const INIT_WAIT = 3500

export async function gotoFresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('___lottery___')
    localStorage.removeItem('___lottery_config___')
    localStorage.setItem('___lottery_countdown___', 'off') // 关倒计时，保持测试时序确定
  })
  await page.reload()
  await page.waitForTimeout(INIT_WAIT)
}

// 完整抽一轮：开始 → 等旋转 → 停 → 等开奖
// 主操作是单个 toggle 大按钮 #primaryCta（开始抽奖 ↔ 停 !），两次点同一按钮
export async function drawOneRound(page: Page) {
  await page.locator('#primaryCta').click()
  await expect(page.locator('#primaryCta')).toHaveText('停 !', { timeout: 20000 })
  await page.locator('#primaryCta').click()
  await expect(page.locator('#primaryCta')).toBeEnabled({ timeout: 20000 })
}

export async function closeBanner(page: Page) {
  const banner = page.locator('.lottery-win-banner')
  if (await banner.count()) {
    await banner.click()
    await page.waitForTimeout(300)
  }
}
