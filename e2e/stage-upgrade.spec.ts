import { expect, test, type Page } from '@playwright/test'
import { gotoFresh } from './helpers'

async function start(page: Page) {
  await page.locator('#primaryCta').click()
  await expect(page.locator('#primaryCta')).toHaveText('停 !')
}

async function presenting(page: Page) {
  await expect(page.locator('.lottery-wrap')).toHaveAttribute('data-stage-phase', 'presenting', { timeout: 15_000 })
}

async function saved(page: Page) {
  return page.evaluate(() => localStorage.getItem('___lottery___'))
}

test('重复停止、跳过、重放与分组始终展示同一份已保存结果', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoFresh(page)
  await start(page)
  await page.evaluate(async () => {
    const path = '/src/views/lottery/core/lottery-controller.ts'
    const { dispatchLotteryCommand } = await import(path)
    void dispatchLotteryCommand({ action: 'stop' })
    void dispatchLotteryCommand({ action: 'stop' })
    void dispatchLotteryCommand({ action: 'toggleDraw' })
  })
  await page.getByRole('button', { name: '跳过动画，直接定格' }).click()
  await presenting(page)
  const committed = await saved(page)
  expect(JSON.parse(committed!).drawLog.filter((entry: { type: string }) => entry.type === 'draw')).toHaveLength(1)
  const ids = await page.locator('.element.winner-current').evaluateAll(elements => elements.map(e => e.getAttribute('data-card-id')).sort())
  await expect(page.locator('.element.winner-current')).toHaveCount(10)
  await page.waitForTimeout(1400) // Let edge confetti and CSS opacity finish before reviewing the held frame.
  await page.screenshot({ path: test.info().outputPath('stage-1440x900.png') })

  await page.getByRole('button', { name: '下一组中奖者' }).click()
  await presenting(page)
  await expect(page.locator('.presentation-groups')).toContainText('1 / 2 组')
  await expect(page.locator('.element.winner-current:visible')).toHaveCount(5)
  await page.screenshot({ path: test.info().outputPath('stage-group-5.png') })
  await page.getByRole('button', { name: '下一组中奖者' }).click()
  await presenting(page)
  await expect(page.locator('.element.winner-current:visible')).toHaveCount(5)
  await page.getByRole('button', { name: '中奖总览', exact: true }).click()
  await presenting(page)
  await expect(page.locator('.element.winner-current:visible')).toHaveCount(10)
  await page.getByRole('button', { name: '展示全部', exact: true }).click()
  await expect(page.locator('#primaryCta')).toBeEnabled()
  await page.getByRole('button', { name: '重放揭晓', exact: true }).click()
  await presenting(page)
  expect(await saved(page)).toBe(committed)
  const backgroundError = await page.evaluate(async () => {
    const path = '/src/views/lottery/3d/3d-core.ts'
    const { objects, targets }: typeof import('../src/views/lottery/3d/3d-core') = await import(path)
    return Math.max(...objects.map((object, index) => object.element.classList.contains('winner-current') ? 0 : object.position.distanceTo(targets.sphere[index].position)))
  })
  expect(backgroundError).toBeLessThan(1e-6)
  expect(await page.locator('.element.winner-current').evaluateAll(elements => elements.map(e => e.getAttribute('data-card-id')).sort())).toEqual(ids)

  await page.setViewportSize({ width: 1280, height: 600 })
  await page.getByRole('button', { name: '视角复位', exact: true }).click()
  await presenting(page)
  await page.waitForTimeout(1400)
  await page.screenshot({ path: test.info().outputPath('stage-1280x600.png') })
  expect(await page.evaluate(() => document.body.scrollHeight <= innerHeight)).toBe(true)
  const list = await page.locator('.prize-list').boundingBox()
  const menu = await page.locator('#menu').boundingBox()
  expect(menu!.y).toBeGreaterThanOrEqual(list!.y + list!.height)
  const controls = await page.locator('.lottery-action').boundingBox()
  expect(controls!.y + controls!.height).toBeLessThanOrEqual(600)
  const banner = await page.locator('.lottery-win-banner').boundingBox()
  expect(banner!.height).toBeLessThan(80)
  const cards = await page.locator('.element.winner-current').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }))
  expect(Math.min(...cards.map(c => c.top))).toBeGreaterThan(banner!.y + banner!.height)
  expect(Math.max(...cards.map(c => c.bottom))).toBeLessThan(600)
})

test('双屏准备阶段禁用主操作，远端跳过与重放不重复开奖', async ({ page }) => {
  await gotoFresh(page)
  const popup = page.waitForEvent('popup')
  await page.locator('.dual-screen-btn').click()
  const remote = await popup
  await expect(remote.locator('.control-conn')).toContainText('已连接')
  await remote.locator('.control-cta').click()
  await expect(remote.locator('.control-cta')).toHaveText('停 !')
  await remote.locator('.control-cta').click()
  await expect(remote.locator('.control-cta')).toBeDisabled()
  await remote.getByRole('button', { name: '跳过动画，直接定格' }).click()
  await presenting(page)
  const committed = await saved(page)
  await remote.getByRole('button', { name: '重放揭晓', exact: true }).click()
  await presenting(page)
  expect(await saved(page)).toBe(committed)
  await remote.getByRole('button', { name: '分组近景', exact: true }).click()
  await expect(page.locator('.element.winner-current:visible')).toHaveCount(5)
  await remote.close()
})

test('减少动态效果覆盖准备、旋转、揭晓与重放', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoFresh(page)
  await start(page)
  const first = await page.locator('#container > div > div').first().getAttribute('style')
  await page.waitForTimeout(150)
  expect(await page.locator('#container > div > div').first().getAttribute('style')).toBe(first)
  await page.locator('#primaryCta').click()
  await presenting(page)
  const committed = await saved(page)
  await page.getByRole('button', { name: '重放揭晓', exact: true }).click()
  await presenting(page)
  expect(await saved(page)).toBe(committed)
  await expect(page.locator('.element.winner-current')).toHaveCount(10)
})

test('撤销当前一轮会撤下已失效的中奖标题和镜头', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await gotoFresh(page)
  await start(page)
  await page.locator('#primaryCta').click()
  await presenting(page)
  await expect(page.locator('.lottery-win-banner')).toBeVisible()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.locator('.confirm-btns button.primary').click()
  await expect(page.locator('.lottery-win-banner')).toHaveCount(0)
  await expect(page.locator('.winner-current')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重放揭晓', exact: true })).toHaveCount(0)
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('20/20')
})

test('只更改奖项揭晓节奏保留正式进度，隆重揭晓与重放不改变结果', async ({ page }) => {
  await gotoFresh(page)
  await start(page)
  await page.locator('#primaryCta').click()
  await presenting(page)
  const before = await saved(page)
  await page.locator('.config-btn').click()
  await page.locator('.prize-presentation-select').last().selectOption('ceremonial')
  await page.locator('.panel-actions button.primary').click()
  await expect(page.locator('.lottery-config-panel')).toHaveCount(0)
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
  expect(await saved(page)).toBe(before)
  await page.locator('.config-btn').click()
  await expect(page.locator('.prize-presentation-select').last()).toHaveValue('ceremonial')
  await page.locator('.lottery-config-panel .close-btn').click()
  await start(page)
  await page.locator('#primaryCta').click()
  await presenting(page)
  const committed = await saved(page)
  const reveal = await page.evaluate(async () => {
    const path = '/src/views/lottery/core/lottery-controller.ts'
    return (await import(path)).getLastReveal()
  })
  expect(reveal.presentation).toBe('ceremonial')
  await page.getByRole('button', { name: '重放揭晓', exact: true }).click()
  await presenting(page)
  expect(await saved(page)).toBe(committed)
})

test('球体待机慢环绕，显式复位后保持静止且不改变进度', async ({ page }) => {
  await gotoFresh(page)
  const before = await saved(page)
  await page.getByRole('button', { name: '轮播展示', exact: true }).click()
  await expect(page.locator('.lottery-wrap')).toHaveAttribute('data-stage-phase', 'idle')
  const position = () => page.evaluate(async () => {
    const path = '/src/views/lottery/3d/3d-core.ts'
    return (await import(path)).camera.position.toArray()
  })
  const first = await position()
  await expect.poll(position).not.toEqual(first)
  await page.getByRole('button', { name: '视角复位', exact: true }).click()
  await expect(page.locator('.lottery-wrap')).toHaveAttribute('data-stage-phase', 'idle')
  const held = await position()
  await page.waitForTimeout(800)
  expect(await position()).toEqual(held)
  expect(await saved(page)).toBe(before)
})
