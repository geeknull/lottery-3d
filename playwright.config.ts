import { defineConfig, devices } from '@playwright/test'

// E2E 测试：跑真实抽奖流程。dev 服务器由 Playwright 自动拉起。
export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/production/**',
  fullyParallel: false, // 共享 localStorage 状态，串行更稳
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // CI 上除 github 行内注解外，再出 HTML 报告（含失败重试的 trace），作为构建产物便于排查
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:18180',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 18180 --strictPort',
    url: 'http://127.0.0.1:18180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
