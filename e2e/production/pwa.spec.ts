import type { Page } from '@playwright/test'
import { drawOneRound, closeBanner } from '../helpers'
import { test, expect } from './fixtures'

const config = {
  version: 1,
  headerTitle: '离线现场验证',
  prizes: [{ name: '现场奖', count: 2, everyTimeGet: 1 }],
  roster: ['离线张三', '离线李四', '离线王五'],
}

async function waitForServiceWorker(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration?.active?.state
  })).toBe('activated')
  // prompt 模式首次安装不 claim 当前页面，通过正常导航进入受控页面。
  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload()
  }
  // 只有注册成功不足以证明当前页面已由缓存版本接管。
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

async function savedData(page: Page) {
  return page.evaluate(() => ({
    config: JSON.parse(localStorage.getItem('___lottery_config___') ?? 'null'),
    progress: JSON.parse(localStorage.getItem('___lottery___') ?? 'null'),
  }))
}

async function expectRestored(page: Page, winners: string[]) {
  await expect(page.locator('.lottery-header')).toHaveText(config.headerTitle)
  await expect(page.locator('.element .symbol')).toHaveText(config.roster)
  await expect(page.locator('.prize-item-count-text')).toHaveText('1/2')
  await expect(page.locator('.element.prize .symbol')).toHaveText(winners)
}

test.beforeEach(async ({ page, productionSite }) => {
  await productionSite.deploy('first')
  await page.goto(productionSite.url)
  await waitForServiceWorker(page)
  await page.evaluate(value => {
    localStorage.setItem('___lottery_config___', JSON.stringify(value))
    localStorage.setItem('___lottery_countdown___', 'off')
  }, config)
  await page.reload()
  await expect(page.locator('.lottery-header')).toHaveText(config.headerTitle)
  await expect(page.locator('.element')).toHaveCount(config.roster.length)
  // 与核心 E2E 相同：等待初始卡片飞入动画结束后才接受抽奖操作。
  await page.waitForTimeout(3500)
})

test('生产产物断网刷新后能抽奖，再次刷新保留名单和进度', async ({ page, context }) => {
  await context.setOffline(true)
  const response = await page.reload()
  expect(response?.fromServiceWorker()).toBe(true)
  await page.waitForTimeout(3500)
  await drawOneRound(page)
  await expect(page.locator('.banner-winner')).toHaveCount(1)
  await closeBanner(page)
  await expect(page.locator('.element.prize')).toHaveCount(1)
  const winners = await page.locator('.element.prize .symbol').allTextContents()
  const saved = await savedData(page)
  expect(saved.progress).not.toBeNull()

  const restored = await page.reload()
  expect(restored?.fromServiceWorker()).toBe(true)
  await expectRestored(page, winners)
  expect(await savedData(page)).toEqual(saved)
})

test('真实 Service Worker 新版等待确认，应用更新及离线重开保留名单和进度', async ({ page, context, productionSite }) => {
  await drawOneRound(page)
  await closeBanner(page)
  await expect(page.locator('.element.prize')).toHaveCount(1)
  const winners = await page.locator('.element.prize .symbol').allTextContents()
  const saved = await savedData(page)
  await expect(page.locator('meta[name="pwa-e2e-release"]')).toHaveAttribute('content', 'first')

  await productionSite.deploy('second')
  // 执行浏览器真实更新检查，不等待应用的五分钟定时器。
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration?.waiting?.state
  })).toBe('installed')
  await expect(page.locator('.lottery-update-banner')).toBeVisible()
  await expect(page.locator('meta[name="pwa-e2e-release"]')).toHaveAttribute('content', 'first')
  expect(await savedData(page)).toEqual(saved)

  await Promise.all([
    page.waitForEvent('framenavigated', frame => frame === page.mainFrame()),
    page.locator('.update-apply').click(),
  ])
  await expect(page.locator('meta[name="pwa-e2e-release"]')).toHaveAttribute('content', 'second')
  await waitForServiceWorker(page)
  await expectRestored(page, winners)
  expect(await savedData(page)).toEqual(saved)

  await context.setOffline(true)
  const response = await page.reload()
  expect(response?.fromServiceWorker()).toBe(true)
  await expect(page.locator('meta[name="pwa-e2e-release"]')).toHaveAttribute('content', 'second')
  await expectRestored(page, winners)
  expect(await savedData(page)).toEqual(saved)
})
