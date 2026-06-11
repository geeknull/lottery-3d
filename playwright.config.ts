import { defineConfig, devices } from '@playwright/test'

// E2E 测试：跑真实抽奖流程。dev 服务器由 Playwright 自动拉起。
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 共享 localStorage 状态，串行更稳
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
