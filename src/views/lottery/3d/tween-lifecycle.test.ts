import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera, Scene } from 'three'
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { Tween } from '@tweenjs/tween.js'
import { transform } from './3d-animate'
import { cardFlyAnimation, rotateBall, rotateBallStop } from './3d-action'
import { zAnimate } from './3d-calc-distance'
import { camera, controls, objects, targets } from './3d-core'
import { setSceneData } from './3d-scene-data'
import { tweenGroup } from './tween-group'

// Keep the real animation entry points and Tween implementation; only the browser
// renderer/controls are replaced because jsdom cannot render a CSS3D scene.
vi.mock('./3d-core', () => ({
  camera: new PerspectiveCamera(40, 16 / 9, 1, 10000),
  scene: new Scene(),
  controls: { enabled: true },
  objects: [],
  targets: { table: [], sphere: [], helix: [], grid: [] },
  cardSize: { width: 140, height: 180, padding: 20 },
  render: vi.fn(),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  camera.position.set(0, 0, 3000)
  controls.enabled = true
  setSceneData({ cardList: [], cardListWinAll: [], colCount: 20, rowCount: 25 })
})

afterEach(() => {
  rotateBallStop()
  vi.runOnlyPendingTimers()
  tweenGroup.removeAll()
  objects.length = 0
  Object.values(targets).forEach(list => { list.length = 0 })
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function addCards(count: number) {
  for (let index = 0; index < count; index++) {
    objects.push(new CSS3DObject(document.createElement('div')))
    for (const list of Object.values(targets)) {
      const target = new Object3D()
      target.position.set(index, index * 2, index * 3)
      list.push(target)
    }
  }
}

describe('shared animation lifecycle', () => {
  it('releases every completed tween across repeated real layout transitions', async () => {
    addCards(500)
    const layouts = ['table', 'sphere', 'helix', 'grid'] as const
    for (let round = 0; round < 10; round++) {
      const done = transform(layouts[round % layouts.length], 100)
      tweenGroup.update(201)
      await done
      expect(objects[499].position.toArray()).toEqual([499, 998, 1497])
      expect(tweenGroup.getAll()).toHaveLength(0)
    }
  })

  it('finishes camera and winner-flight promises and releases their tweens', async () => {
    addCards(2)
    const cameraDone = zAnimate(4000, 100)
    const flightDone = cardFlyAnimation([0, 1])
    tweenGroup.update(1201)
    await Promise.all([cameraDone, flightDone])
    expect(camera.position.z).toBe(4000)
    expect(objects.every(object => object.element.classList.contains('prize'))).toBe(true)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('cleans up repeated stopped spins without cancelling another animation', async () => {
    const cameraDone = zAnimate(4000, 1000)
    for (let round = 0; round < 10; round++) {
      rotateBall()
      tweenGroup.update(100)
      rotateBallStop()
      vi.runOnlyPendingTimers()
      tweenGroup.update(101)
      expect(controls.enabled).toBe(true)
      expect(tweenGroup.getAll()).toHaveLength(1)
      expect(tweenGroup.getAll()[0].isPlaying()).toBe(true)
    }
    tweenGroup.update(1001)
    await cameraDone
    expect(camera.position.z).toBe(4000)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('keeps paused and repeating tweens until their actual completion', () => {
    const complete = vi.fn()
    const tween = new Tween({ x: 0 }, tweenGroup)
      .to({ x: 1 }, 100)
      .repeat(1)
      .onComplete(complete)
      .start(0)
    tweenGroup.update(50)
    tween.pause(50)
    tweenGroup.update(500)
    expect(tweenGroup.getAll()).toContain(tween)
    tween.resume(500)
    tweenGroup.update(551)
    expect(tweenGroup.getAll()).toContain(tween)
    expect(complete).not.toHaveBeenCalled()
    tweenGroup.update(651)
    expect(complete).toHaveBeenCalledOnce()
    expect(tweenGroup.getAll()).toHaveLength(0)
  })
})
