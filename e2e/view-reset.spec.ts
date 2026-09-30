import { expect, test, type Page } from '@playwright/test'
import { closeBanner, gotoFresh } from './helpers'

const resetButton = (page: Page) => page.getByRole('button', { name: /视角复位/ })

async function viewState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/views/lottery/3d/3d-core.ts'
    const { camera, controls } = await import(path)
    const rounded = (values: number[]) => values.map(value => Math.round(value * 1e6) / 1e6)
    return {
      position: rounded(camera.position.toArray()),
      up: rounded(camera.up.toArray()),
      quaternion: rounded(camera.quaternion.toArray()),
      target: rounded(controls.target.toArray()),
      zoom: camera.zoom,
      matrix: rounded(camera.matrixWorld.elements),
    }
  })
}

async function sceneState(page: Page) {
  return page.evaluate(async () => {
    const corePath = '/src/views/lottery/3d/3d-core.ts'
    const animationPath = '/src/views/lottery/3d/3d-animate.ts'
    const { objects } = await import(corePath)
    const { transformStatus } = await import(animationPath)
    return {
      layout: transformStatus,
      cards: objects.map((object: { position: { toArray(): number[] }, quaternion: { toArray(): number[] } }) => [
        ...object.position.toArray(), ...object.quaternion.toArray(),
      ]),
      savedDraw: localStorage.getItem('___lottery___'),
    }
  })
}

// Shortcut/guard tests start from a deterministic displaced camera. Real pointer
// rotation, panning, zoom and their damping are exercised separately below.
async function displaceView(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/views/lottery/3d/3d-core.ts'
    const { camera, controls, render } = await import(path)
    controls.target.set(90, -70, 40)
    camera.position.set(450, 250, camera.position.z * 0.8)
    camera.up.set(0.2, 1, 0.1).normalize()
    camera.zoom = 1.3
    camera.updateProjectionMatrix()
    camera.lookAt(controls.target)
    controls.update()
    render()
  })
}

async function waitForView(page: Page, expected: Awaited<ReturnType<typeof viewState>>) {
  await expect.poll(() => viewState(page)).toEqual(expected)
  await expect(resetButton(page)).toBeEnabled()
}

async function waitForIdle(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const path = '/src/views/lottery/core/lottery-status.ts'
    return (await import(path)).default.isWait()
  })).toBe(true)
}

test.describe('3D 视角复位', () => {
  test.beforeEach(async ({ page }) => {
    await gotoFresh(page)
    await expect(resetButton(page)).toBeEnabled()
  })

  test('拖动、右键平移和滚轮缩放后立即复位，动画结束后没有残留惯性', async ({ page }) => {
    const original = await viewState(page)
    const scene = await sceneState(page)
    const bounds = await page.locator('#container').boundingBox()
    expect(bounds).not.toBeNull()
    const x = bounds!.x + bounds!.width * 0.5
    const y = bounds!.y + bounds!.height * 0.5

    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 110, y + 70, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await viewState(page)).quaternion).not.toEqual(original.quaternion)

    await page.mouse.down({ button: 'right' })
    await page.mouse.move(x + 40, y - 30, { steps: 5 })
    await page.mouse.up({ button: 'right' })
    await expect.poll(async () => (await viewState(page)).target).not.toEqual(original.target)

    const distanceFromTarget = async () => {
      const { position, target } = await viewState(page)
      return Math.hypot(...position.map((value, axis) => value - target[axis]))
    }
    const beforeWheel = await distanceFromTarget()
    await page.mouse.wheel(0, 320)
    await expect.poll(distanceFromTarget).toBeGreaterThan(beforeWheel + 10)
    await resetButton(page).click()
    await waitForView(page, original)
    // A second observation after many animation frames catches stale Trackball
    // damping that would move the camera away again after the reset tween.
    await page.waitForTimeout(800)
    expect(await viewState(page)).toEqual(original)
    expect(await sceneState(page)).toEqual(scene)
  })

  test('R 复位完整相机状态，输入框、弹窗和 Ctrl+R 不误触', async ({ page }) => {
    const original = await viewState(page)
    await displaceView(page)
    const displaced = await viewState(page)
    expect(displaced).not.toEqual(original)

    await page.locator('.config-btn').click()
    await page.locator('.title-input').focus()
    await page.keyboard.press('r')
    await page.waitForTimeout(600)
    expect(await viewState(page)).toEqual(displaced)
    await page.locator('.lottery-config-panel .close-btn').focus()
    await page.keyboard.press('r')
    await page.waitForTimeout(600)
    expect(await viewState(page)).toEqual(displaced)
    await page.keyboard.press('Escape')
    await expect(page.locator('.lottery-config-panel')).toHaveCount(0)

    // Dispatch through the actual window handler without triggering the
    // browser's native reload accelerator.
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'r', code: 'KeyR', ctrlKey: true, bubbles: true, cancelable: true,
    })))
    await page.waitForTimeout(600)
    expect(await viewState(page)).toEqual(displaced)

    await page.keyboard.press('r')
    await waitForView(page, original)
  })

  test('聚焦复位按钮后按 Enter 只复位，不启动抽奖', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 })
    await waitForIdle(page)
    await expect(resetButton(page)).toBeInViewport()
    expect(await page.evaluate(() => document.body.scrollHeight <= window.innerHeight)).toBe(true)
    // Resizing preserves the current view until reset. Establish the framing
    // for this viewport before checking native Enter activation of the button.
    await resetButton(page).click()
    await waitForIdle(page)
    const original = await viewState(page)
    await displaceView(page)
    await resetButton(page).focus()
    await page.keyboard.press('Enter')
    await waitForView(page, original)
    await expect(page.locator('#primaryCta')).toHaveText('开始抽奖')
    expect(await page.evaluate(async () => {
      const path = '/src/views/lottery/core/lottery-controller.ts'
      return (await import(path)).isSpinning()
    })).toBe(false)
    await expect(page.locator('.element.prize')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath('view-reset-1280x600.png') })
  })

  test('抽奖过程中拒绝复位，开奖后复位保留中奖卡片和已保存进度', async ({ page }) => {
    await page.locator('#primaryCta').click()
    await expect(page.locator('#primaryCta')).toHaveText('停 !')
    await expect(resetButton(page)).toBeDisabled()
    expect(await page.evaluate(async () => {
      const corePath = '/src/views/lottery/3d/3d-core.ts'
      const controllerPath = '/src/views/lottery/core/lottery-controller.ts'
      const statusPath = '/src/views/lottery/core/lottery-status.ts'
      const core = await import(corePath)
      const controller = await import(controllerPath)
      const { default: status } = await import(statusPath)
      const controlsBefore = core.controls
      await controller.resetView()
      return {
        sameControls: core.controls === controlsBefore,
        spinning: controller.isSpinning(),
        running: status.isRun(),
        enabled: core.controls.enabled,
      }
    })).toEqual({ sameControls: true, spinning: true, running: true, enabled: false })

    await page.locator('#primaryCta').click()
    await expect(page.locator('.lottery-win-banner')).toBeVisible({ timeout: 10_000 })
    const winners = await page.locator('.banner-winner').allTextContents()
    expect(winners).toHaveLength(10)
    await closeBanner(page)
    await expect(resetButton(page)).toBeEnabled()
    const scene = await sceneState(page)
    await displaceView(page)
    await resetButton(page).click()
    await waitForIdle(page)
    await expect.poll(async () => (await viewState(page)).zoom).toBe(1)
    expect(await sceneState(page)).toEqual(scene)
    await expect(page.locator('.element.prize')).toHaveCount(10)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('已抽 10/20')
    await page.getByRole('button', { name: '展示中奖' }).click()
    const listedWinners = await page.locator('.prize-win-user-name').allTextContents()
    for (const winner of winners) expect(listedWinners.some(name => name.includes(winner.trim()))).toBe(true)
  })

  test('窄窗口同步拖动范围，四种布局复位后完整入镜并停止轮播', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 600 })
    await expect.poll(() => page.evaluate(async () => {
      const path = '/src/views/lottery/3d/3d-core.ts'
      const { controls, renderer } = await import(path)
      const rect = renderer.domElement.getBoundingClientRect()
      return Math.max(
        Math.abs(controls.screen.width - rect.width), Math.abs(controls.screen.height - rect.height),
        Math.abs(controls.screen.left - rect.left), Math.abs(controls.screen.top - rect.top),
      )
    })).toBeLessThan(1)

    await page.getByRole('button', { name: '轮播展示' }).click()
    await waitForIdle(page)
    await resetButton(page).click()
    await expect(page.getByRole('button', { name: '轮播展示' })).toBeVisible()
    await waitForIdle(page)
    expect((await sceneState(page)).layout).toBe('sphere')

    for (const layout of ['table', 'sphere', 'helix', 'grid']) {
      await page.evaluate(async (type) => {
        const path = '/src/views/lottery/3d/3d-animate.ts'
        await (await import(path)).transform(type, 30)
      }, layout)
      const scene = await sceneState(page)
      await displaceView(page)
      await resetButton(page).click()
      await waitForIdle(page)
      await expect.poll(async () => (await viewState(page)).zoom).toBe(1)
      await expect(resetButton(page)).toBeEnabled()
      expect(await sceneState(page)).toEqual(scene)
      const extents = await page.evaluate(async () => {
        const path = '/src/views/lottery/3d/3d-core.ts'
        const { camera, objects, cardSize } = await import(path)
        let x = 0
        let y = 0
        for (const object of objects) {
          for (const dx of [-0.5, 0.5]) {
            for (const dy of [-0.5, 0.5]) {
              const corner = object.position.clone().set(dx * cardSize.width, dy * cardSize.height, 0)
              object.localToWorld(corner).project(camera)
              x = Math.max(x, Math.abs(corner.x))
              y = Math.max(y, Math.abs(corner.y))
            }
          }
        }
        return { x, y }
      })
      expect(extents.x, `${layout} horizontal framing`).toBeLessThan(1)
      expect(extents.y, `${layout} vertical framing`).toBeLessThan(1)
    }
    await expect(resetButton(page)).toBeInViewport()
  })
})
