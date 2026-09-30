import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../components/feedback', () => ({ toast: vi.fn() }))

async function loadFresh() {
  vi.resetModules()
  const { default: status } = await import('./lottery-status')
  status.setStatusWait()
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
  it('抽奖准备/旋转/揭晓中不能启动轮播夺取阶段控制权', async () => {
    const { default: status } = await import('./lottery-status')
    const { deps, calls } = makeDeps()
    for (const phase of ['preparing', 'spinning', 'revealing'] as const) {
      status.setPhase(phase)
      await showcase.startShowcase(deps)
      expect(status.getPhase()).toBe(phase)
      expect(showcase.isShowcaseActive()).toBe(false)
    }
    expect(calls).toEqual([])
  })

  it('旧轮播和归位 Promise 不会覆盖后续抽奖或场景卸载的阶段', async () => {
    const { default: status } = await import('./lottery-status')
    let finishOld!: () => void
    let finishTable!: () => void
    const deps = {
      doTransform: () => new Promise<void>(resolve => { finishOld = resolve }),
      wait: async () => {},
    }
    const oldShowcase = showcase.startShowcase(deps)
    showcase.stopShowcase()
    const table = showcase.returnToTable({ ...deps, doTransform: () => new Promise<void>(resolve => { finishTable = resolve }) })
    finishOld()
    await oldShowcase
    expect(status.getPhase()).toBe('transitioning')
    showcase.stopShowcase()
    status.setPhase('preparing')
    finishTable()
    await table
    expect(status.getPhase()).toBe('preparing')

    status.setStatusWait()
    const beforeDispose = showcase.startShowcase(deps)
    showcase.stopShowcase()
    status.setPhase('init')
    finishOld()
    await beforeDispose
    expect(status.getPhase()).toBe('init')
  })

  it('布局失败会停止轮播并释放忙碌态，可继续正常抽奖', async () => {
    const { default: status } = await import('./lottery-status')
    await showcase.startShowcase({ doTransform: async () => { throw new Error('failed') }, wait: async () => {} })
    expect(showcase.isShowcaseActive()).toBe(false)
    expect(status.isWait()).toBe(true)
  })

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
