import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLotteryScene, dispose, init } from './3d'
import { animate, stopAnimation } from './3d-animate'
import { controls, flushRender, getRenderStats, objects, render, renderer, targets } from './3d-core'
import { tweenGroup } from './tween-group'
import type { SceneData } from './3d-scene-data'

const data: SceneData = {
  cardList: Array.from({ length: 6 }, (_, index) => ({
    id: String(index), name: `嘉宾 ${index}`, avatar: '', index, col: index % 3 + 1, row: Math.floor(index / 3) + 1,
  })),
  cardListWinAll: [], colCount: 3, rowCount: 2,
}
let frame: FrameRequestCallback | undefined
const disconnect = vi.fn()

beforeEach(() => {
  document.body.innerHTML = '<div id="container"></div>'
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 700 } as DOMRect)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect })
  disconnect.mockClear()
})

afterEach(() => {
  dispose()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('owned CSS3D scene lifecycle', () => {
  it('coalesces repeated camera, controls and layout invalidations to one render', () => {
    init(data)
    const draw = vi.spyOn(renderer, 'render')
    render()
    render()
    render()
    expect(draw).not.toHaveBeenCalled()
    flushRender()
    flushRender()
    expect(draw).toHaveBeenCalledOnce()
    expect(getRenderStats().renders).toBe(1)
  })

  it('owns one frame loop and cancels its frame when stopped', () => {
    init(data)
    animate()
    animate()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    frame?.(16)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    stopAnimation()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
  })

  it('settles pending transitions and removes all owned resources before remount', async () => {
    const first = createLotteryScene(data)
    const pending = first.transform('sphere', 1000)
    const oldControls = controls
    const controlsDispose = vi.spyOn(oldControls, 'dispose')
    expect(objects).toHaveLength(6)
    first.dispose()
    await pending
    expect(disconnect).toHaveBeenCalledOnce()
    expect(controlsDispose).toHaveBeenCalledOnce()
    expect(tweenGroup.getAll()).toHaveLength(0)
    expect(objects).toHaveLength(0)
    expect(targets.sphere).toHaveLength(0)
    expect(document.querySelector('#container')?.children).toHaveLength(0)

    const second = createLotteryScene(data)
    first.dispose() // An obsolete owner cannot destroy the newer scene.
    expect(objects).toHaveLength(6)
    expect(document.querySelector('#container')?.children).toHaveLength(1)
    second.dispose()
    expect(objects).toHaveLength(0)
  })
})
