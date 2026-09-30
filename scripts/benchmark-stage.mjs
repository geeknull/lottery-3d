import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'

// Run against the dedicated preview, never the E2E ports. Each roster gets a
// fresh browser context and the same deterministic synthetic configuration.
const baseURL = process.env.BENCH_URL || 'http://127.0.0.1:18182'
const label = process.argv[2] || 'current'
const browser = await chromium.launch()
const results = []
try {
  for (const count of [500, 1000, 3000]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript(({ count }) => {
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1, headerTitle: '舞台性能采样',
        prizes: [{ name: '测试奖', count: 30, everyTimeGet: 10 }],
        roster: Array.from({ length: count }, (_, i) => `参会者 ${i + 1}`),
        avatarStyle: 'initials', avatarAutoDowngrade: true,
      }))
      localStorage.removeItem('___lottery___')
      localStorage.setItem('___lottery_countdown___', 'off')
      localStorage.setItem('___lottery_sound___', 'off')
    }, { count })
    const page = await context.newPage()
    await page.goto(baseURL)
    await page.waitForFunction(async () => {
      const path = '/src/views/lottery/core/lottery-status.ts'
      return (await import(path)).default.isWait()
    }, null, { timeout: 60000 })
    const initMs = await page.evaluate(() => performance.now())
    const cdp = await context.newCDPSession(page)
    await cdp.send('Performance.enable')
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage')
      const { metrics } = await cdp.send('Performance.getMetrics')
      return metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576
    }
    const heapMB = [await heap()]
    const samples = []
    for (let round = 0; round < 3; round++) {
      await page.locator('#primaryCta').click()
      await page.waitForFunction(async () => {
        const path = '/src/views/lottery/core/lottery-controller.ts'
        return (await import(path)).isSpinning()
      })
      const sample = await page.evaluate(async () => {
        const path = '/src/views/lottery/3d/3d-core.ts'
        const { renderer } = await import(path)
        const original = renderer.render
        const intervals = []
        const renders = new Map()
        let frame = 0
        let previous = performance.now()
        renderer.render = function (...args) {
          renders.set(frame, (renders.get(frame) || 0) + 1)
          return original.apply(this, args)
        }
        await new Promise(resolve => {
          const start = performance.now()
          const tick = now => {
            intervals.push(now - previous)
            previous = now
            frame++
            if (now - start < 4000) requestAnimationFrame(tick)
            else resolve()
          }
          requestAnimationFrame(tick)
        })
        renderer.render = original
        intervals.shift()
        const sorted = intervals.toSorted((a, b) => a - b)
        return {
          frames: intervals.length,
          medianMs: sorted[Math.floor(sorted.length * .5)],
          p95Ms: sorted[Math.floor(sorted.length * .95)],
          maxRendersPerFrame: Math.max(0, ...renders.values()),
          renderCalls: [...renders.values()].reduce((a, b) => a + b, 0),
        }
      })
      samples.push(sample)
      await page.locator('#primaryCta').click()
      await page.waitForFunction(async () => {
        const path = '/src/views/lottery/core/lottery-status.ts'
        return (await import(path)).default.isWait()
      }, null, { timeout: 30000 })
      const banner = page.locator('.lottery-win-banner')
      if (await banner.isVisible()) await banner.click()
      heapMB.push(await heap())
    }
    const result = { count, initMs, heapMB, samples }
    results.push(result)
    console.log(JSON.stringify(result))
    await context.close()
  }
  await mkdir('docs/performance', { recursive: true })
  await writeFile(`docs/performance/${label}.json`, JSON.stringify({
    label, capturedAt: new Date().toISOString(), baseURL,
    environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model, chromium: browser.version(), headless: true, viewport: '1440x900' },
    note: 'Development server; four-second spinning windows, three rounds per fresh roster context. Heap after forced GC. Timing is machine-specific, not a production FPS guarantee.',
    results,
  }, null, 2) + '\n')
} finally {
  await browser.close()
}
