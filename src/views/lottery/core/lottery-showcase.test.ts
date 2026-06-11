import { describe, it, expect, beforeEach, vi } from 'vitest'

async function loadFresh() {
  vi.resetModules()
  return await import('./lottery-showcase')
}

// 用假 transform/wait 驱动轮播逻辑，不依赖真实 3D 场景
function makeDeps() {
  const calls: string[] = []
  let waitCount = 0
  return {
    calls,
    deps: {
      doTransform: async (type: string) => { calls.push(type) },
      wait: async () => {
        waitCount++
        if (waitCount > 6) {
          // 防御：测试中超过 6 轮自动断开，避免死循环
          throw new Error('too many cycles')
        }
      },
    },
  }
}

let showcase: typeof import('./lottery-showcase')

beforeEach(async () => {
  showcase = await loadFresh()
})

describe('lottery-showcase', () => {
  it('按 sphere→helix→grid→table 顺序循环切换布局', async () => {
    const { calls, deps } = makeDeps()
    const origWait = deps.wait
    const stopAfter = 5
    deps.wait = async () => {
      await origWait()
      if (calls.length >= stopAfter) showcase.stopShowcase()
    }
    await showcase.startShowcase(deps)
    expect(calls.slice(0, 5)).toEqual(['sphere', 'helix', 'grid', 'table', 'sphere'])
  })

  it('启动后 isShowcaseActive 为 true，停止后为 false', async () => {
    const { deps } = makeDeps()
    deps.wait = async () => {
      expect(showcase.isShowcaseActive()).toBe(true)
      showcase.stopShowcase()
    }
    await showcase.startShowcase(deps)
    expect(showcase.isShowcaseActive()).toBe(false)
  })

  it('重复启动不会叠加循环', async () => {
    const { calls, deps } = makeDeps()
    deps.wait = async () => { showcase.stopShowcase() }
    const first = showcase.startShowcase(deps)
    const second = showcase.startShowcase(deps) // 已激活，应直接返回
    await Promise.all([first, second])
    expect(calls).toEqual(['sphere'])
  })

  it('停止时回到 table 布局', async () => {
    const { calls, deps } = makeDeps()
    deps.wait = async () => { showcase.stopShowcase() }
    await showcase.startShowcase(deps)
    await showcase.returnToTable(deps)
    expect(calls[calls.length - 1]).toBe('table')
  })
})
