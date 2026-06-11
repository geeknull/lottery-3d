import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './', // 线上构建出来是相对路径在demo页才好展示
  plugins: [
    react(),
    // PWA：年会现场断网也能打开（资源全量预缓存，自动更新）
    VitePWA({
      registerType: 'autoUpdate',
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
    exclude: ['node_modules', 'dist', 'e2e/**'] // e2e 用 @playwright/test 单独跑
  }
})
