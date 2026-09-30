import { defineConfig, devices } from '@playwright/test'

// 独立于开发服务器：fixture 构建真实产物并启动同源生产预览。
export default defineConfig({
  testDir: './e2e/production',
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/pwa',
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report/pwa', open: 'never' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
})
