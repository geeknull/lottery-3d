import { expect, test, type Page } from '@playwright/test'
import { closeBanner, gotoFresh } from './helpers'

async function waitForIdle(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/views/lottery/core/lottery-status.ts'
    return (await import(path)).default.isWait()
  })).toBe(true)
}

async function projectedWinners(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/views/lottery/3d/3d-core.ts'
    const { camera, objects, cardSize, renderer }: typeof import('../src/views/lottery/3d/3d-core') = await import(path)
    const stage = renderer.domElement.getBoundingClientRect()
    const controls = document.querySelector('.lottery-view-controls')!.getBoundingClientRect()
    const cards = objects.filter(object => object.element.classList.contains('prize')).map(object => {
      const corners = [-0.5, 0.5].flatMap(x => [-0.5, 0.5].map(y => {
        const point = object.position.clone().set(x * cardSize.width, y * cardSize.height, 0)
        object.localToWorld(point).project(camera)
        return {
          x: (point.x + 1) * stage.width / 2,
          y: (1 - point.y) * stage.height / 2,
          z: point.z,
        }
      }))
      const left = Math.min(...corners.map(point => point.x))
      const right = Math.max(...corners.map(point => point.x))
      const top = Math.min(...corners.map(point => point.y))
      const bottom = Math.max(...corners.map(point => point.y))
      const name = object.element.querySelector<HTMLElement>('.symbol')!
      return {
        id: object.element.dataset.cardId,
        left, right, top, bottom,
        centerX: (left + right) / 2,
        centerY: (top + bottom) / 2,
        near: Math.min(...corners.map(point => point.z)),
        far: Math.max(...corners.map(point => point.z)),
        nameHeight: name.getBoundingClientRect().height,
        unscaledNameHeight: name.offsetHeight,
      }
    })
    return {
      width: stage.width, height: stage.height, cardWidth: cardSize.width, cards,
      controls: { left: controls.left - stage.left, right: controls.right - stage.left,
        top: controls.top - stage.top, bottom: controls.bottom - stage.top },
    }
  })
}

type Projection = Awaited<ReturnType<typeof projectedWinners>>

function rowsOf(projection: Projection) {
  const rows: Projection['cards'][] = []
  for (const card of [...projection.cards].sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX)) {
    const row = rows.find(items => Math.abs(items[0].centerY - card.centerY) < 0.5)
    if (row) row.push(card)
    else rows.push([card])
  }
  return rows
}

function expectReadableLayout(projection: Projection, count: number) {
  expect(projection.cards).toHaveLength(count)
  for (const card of projection.cards) {
    expect(card.left, `${card.id} left edge`).toBeGreaterThanOrEqual(-0.5)
    expect(card.right, `${card.id} right edge`).toBeLessThanOrEqual(projection.width + 0.5)
    expect(card.top, `${card.id} top edge`).toBeGreaterThanOrEqual(-0.5)
    expect(card.bottom, `${card.id} bottom edge`).toBeLessThanOrEqual(projection.height + 0.5)
    expect(card.near).toBeGreaterThan(-1)
    expect(card.far).toBeLessThan(1)
    expect(card.nameHeight).toBeGreaterThan(0)
    const controlOverlapX = Math.min(card.right, projection.controls.right) - Math.max(card.left, projection.controls.left)
    const controlOverlapY = Math.min(card.bottom, projection.controls.bottom) - Math.max(card.top, projection.controls.top)
    expect(controlOverlapX <= 0 || controlOverlapY <= 0, `${card.id} covered by view controls`).toBe(true)
  }
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = projection.cards[i]
      const b = projection.cards[j]
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      expect(overlapX <= 0.5 || overlapY <= 0.5, `${a.id} and ${b.id} overlap`).toBe(true)
    }
  }
  // Every row, including an incomplete final row, must be centered on screen.
  const rows = rowsOf(projection)
  for (const row of rows) {
    const center = (Math.min(...row.map(card => card.left)) + Math.max(...row.map(card => card.right))) / 2
    expect(Math.abs(center - projection.width / 2)).toBeLessThan(0.5)
  }
  return rows
}

async function revealCards(page: Page, count: number) {
  await page.evaluate(async (winnerCount) => {
    const animationPath = '/src/views/lottery/3d/3d-animate.ts'
    const distancePath = '/src/views/lottery/3d/3d-calc-distance.ts'
    const actionPath = '/src/views/lottery/3d/3d-action.ts'
    await (await import(animationPath)).transform('sphere', 30)
    await (await import(distancePath)).setSphereDist(2, 0)
    await (await import(actionPath)).cardFlyAnimation(Array.from({ length: winnerCount }, (_, index) => index))
  }, count)
}

async function resetView(page: Page) {
  await page.getByRole('button', { name: /视角复位/ }).click()
  await waitForIdle(page)
}

test.describe('中奖卡片自适应排布', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test.beforeEach(async ({ page }) => {
    await gotoFresh(page)
    await waitForIdle(page)
  })

  test('默认十人真实开奖更易读，缩小窗口复位后仍完整展示并保留结果', async ({ page }) => {
    await page.locator('#primaryCta').click()
    await expect(page.locator('#primaryCta')).toHaveText('停 !')
    await page.locator('#primaryCta').click()
    await expect(page.locator('.lottery-win-banner')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.banner-winner')).toHaveCount(10)
    await closeBanner(page)
    await waitForIdle(page)

    const initial = await projectedWinners(page)
    const rows = expectReadableLayout(initial, 10)
    expect(rows.length).toBeGreaterThanOrEqual(2)
    await expect(page.locator('.element.prize.winner-background')).toHaveCount(0)
    await expect.poll(() => page.locator('.element.winner-background').first().evaluate(element =>
      Number(getComputedStyle(element).opacity),
    )).toBeLessThanOrEqual(0.2)
    expect(await page.locator('.element.prize').first().evaluate(element =>
      getComputedStyle(element).backgroundColor.startsWith('rgb('),
    )).toBe(true)
    for (const card of initial.cards) {
      // Even a gapless single row cannot make ten equal cards wider than
      // stage.width / 10. The new layout must noticeably exceed that text size.
      const singleRowNameLimit = card.unscaledNameHeight * initial.width / (10 * initial.cardWidth)
      expect(card.nameHeight).toBeGreaterThan(singleRowNameLimit * 1.2)
    }
    const savedDraw = await page.evaluate(() => localStorage.getItem('___lottery___'))
    await page.screenshot({ path: test.info().outputPath('winners-1440x900.png') })

    await page.setViewportSize({ width: 1280, height: 600 })
    await resetView(page)
    expectReadableLayout(await projectedWinners(page), 10)
    await page.screenshot({ path: test.info().outputPath('winners-1280x600.png') })

    await page.setViewportSize({ width: 720, height: 600 })
    await resetView(page)
    const narrow = await projectedWinners(page)
    expect(expectReadableLayout(narrow, 10).length).toBeGreaterThan(rows.length)
    expect(narrow.cards.map(card => card.id)).toEqual(initial.cards.map(card => card.id))
    expect(await page.evaluate(() => localStorage.getItem('___lottery___'))).toBe(savedDraw)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
  })

  for (const count of [1, 7, 20]) {
    test(`${count} 人揭晓卡片完整入镜、互不重叠且末行居中`, async ({ page }) => {
      await revealCards(page, count)
      const projection = await projectedWinners(page)
      const rows = expectReadableLayout(projection, count)
      if (count === 1) expect(rows).toHaveLength(1)
      else expect(rows.length).toBeGreaterThan(1)
      if (count === 7) expect(rows.at(-1)!.length).toBeLessThan(rows[0].length)
    })
  }

  test('揭晓途中调整窗口使用最新尺寸，展示全部后复位不会恢复旧中奖排布', async ({ page }) => {
    const reveal = revealCards(page, 7)
    await expect(page.locator('.element.prize')).toHaveCount(7)
    await page.setViewportSize({ width: 720, height: 600 })
    await reveal
    expectReadableLayout(await projectedWinners(page), 7)

    await page.getByRole('button', { name: '展示全部' }).click()
    await waitForIdle(page)
    await expect(page.locator('.winner-background')).toHaveCount(0)
    const positions = await page.evaluate(async () => {
      const path = '/src/views/lottery/3d/3d-core.ts'
      const { objects }: typeof import('../src/views/lottery/3d/3d-core') = await import(path)
      return objects.map(object => [...object.position.toArray(), ...object.quaternion.toArray()])
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await resetView(page)
    const afterReset = await page.evaluate(async () => {
      const corePath = '/src/views/lottery/3d/3d-core.ts'
      const animationPath = '/src/views/lottery/3d/3d-animate.ts'
      const { objects, targets }: typeof import('../src/views/lottery/3d/3d-core') = await import(corePath)
      return {
        layout: (await import(animationPath)).transformStatus,
        positions: objects.map(object => [...object.position.toArray(), ...object.quaternion.toArray()]),
        tableError: Math.max(...objects.map((object, index) => object.position.distanceTo(targets.table[index].position))),
      }
    })
    expect(afterReset.layout).toBe('table')
    expect(afterReset.positions).toEqual(positions)
    expect(afterReset.tableError).toBeLessThan(1e-6)
  })
})
