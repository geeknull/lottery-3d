import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 构建时把 release-notes.json 的 version 烤进包里，作为「本次发布所附说明的版本」。
// 运行时与线上 release-notes.json.version 比对，识别「发了新版却忘了更新说明」的情况。
function readNotesVersion(): string {
  try {
    const p = fileURLToPath(new URL('./public/release-notes.json', import.meta.url))
    const json: unknown = JSON.parse(readFileSync(p, 'utf8'))
    const v = (json as { version?: unknown }).version
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

export default defineConfig({
  base: './', // 线上构建出来是相对路径在demo页才好展示
  define: {
    __NOTES_VERSION__: JSON.stringify(readNotesVersion()),
  },
  plugins: [
    react(),
    // PWA：年会现场断网也能打开（资源全量预缓存）。
    // 用 prompt 而非 autoUpdate：发现新版只提示、由用户择机点更新，
    // 避免在抽奖进行中被 Service Worker 自动刷新打断动画。
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'lottery-3d 抽奖',
        short_name: '3D抽奖',
        description: '基于 three.js CSS3DRenderer 的 3D 抽奖程序，纯前端实现',
        theme_color: '#021620',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname
    }
  },
  server: {
    port: 8080,
    host: true
  },
  test: {
    environment: 'jsdom', // 业务逻辑里有 localStorage / document 访问
    setupFiles: ['fake-indexeddb/auto'], // jsdom 无 IndexedDB，图片仓测试需要
    exclude: ['node_modules', 'dist', 'e2e/**'] // e2e 用 @playwright/test 单独跑
  }
})
