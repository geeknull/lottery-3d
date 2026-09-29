import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'
import { build, preview } from 'vite'

type Release = 'first' | 'second'
interface ProductionSite {
  url: string
  deploy: (release: Release) => Promise<void>
}

export const test = base.extend<object, { productionSite: ProductionSite }>({
  productionSite: [async ({ browserName }, runTests) => {
    expect(browserName).toBe('chromium')
    const root = fileURLToPath(new URL('../../', import.meta.url))
    const temporary = await mkdtemp(join(tmpdir(), 'lottery-pwa-e2e-'))
    const live = join(temporary, 'live')
    let server: Awaited<ReturnType<typeof preview>> | undefined
    try {
      // 两次都走仓库真实 Vite/PWA 配置；HTML 标记使预缓存版本发生真实变化。
      // 不改源码、不覆盖 dist，也不 mock registerSW/onNeedRefresh。
      for (const release of ['first', 'second'] as const) {
        await build({
          root,
          configFile: join(root, 'vite.config.ts'),
          logLevel: 'warn',
          build: { outDir: join(temporary, release), emptyOutDir: true },
          plugins: [{
            name: 'pwa-e2e-release',
            transformIndexHtml: () => [{
              tag: 'meta',
              attrs: { name: 'pwa-e2e-release', content: release },
              injectTo: 'head',
            }],
          }],
        })
      }
      expect(await readFile(join(temporary, 'first/sw.js'), 'utf8'))
        .not.toEqual(await readFile(join(temporary, 'second/sw.js'), 'utf8'))

      const deploy = async (release: Release) => {
        // 先落资源、最后发布 sw.js，模拟同一 origin 上的新部署。
        await cp(join(temporary, release), live, {
          recursive: true,
          filter: source => basename(source) !== 'sw.js',
        })
        await cp(join(temporary, release, 'sw.js'), join(live, 'sw.js'))
      }
      await deploy('first')
      server = await preview({
        configFile: false,
        root,
        base: '/lottery-3d/',
        build: { outDir: live },
        preview: { host: '127.0.0.1', port: 18181, strictPort: true },
      })
      await runTests({ url: 'http://127.0.0.1:18181/lottery-3d/', deploy })
    } finally {
      if (server) {
        server.httpServer.closeAllConnections()
        await new Promise<void>((resolve, reject) => {
          server!.httpServer.close(error => error ? reject(error) : resolve())
        })
      }
      await rm(temporary, { recursive: true, force: true })
    }
  }, { scope: 'worker', timeout: 120_000 }],
})

export { expect }
