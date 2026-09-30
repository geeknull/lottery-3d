import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { Tween } from '@tweenjs/tween.js'
import { transform } from './3d-animate'
import { cardFlyAnimation, rotateBall, rotateBallStop } from './3d-action'
import { resetCameraView, setCameraView } from './3d-camera-view'
import { camera, controls, objects, targets } from './3d-core'
import { setSceneData } from './3d-scene-data'
import { tweenGroup } from './tween-group'

// Keep the real animation entry points and Tween implementation; only the browser
// renderer/controls are replaced because jsdom cannot render a CSS3D scene.
vi.mock('./3d-core', () => {
  const controls = { enabled: true, target: new Vector3() }
  const camera = new PerspectiveCamera(40, 16 / 9, 1, 10000)
  return {
    camera,
    scene: new Scene(),
    controls,
    initControls: vi.fn((target: Vector3) => {
      controls.target.copy(target)
      controls.enabled = true
    }),
    objects: [],
    targets: { table: [], sphere: [], helix: [], grid: [] },
    cardSize: { width: 140, height: 180, padding: 20 },
    getContainerWidth: () => camera.aspect * 800,
    getContainerHeight: () => 800,
    render: vi.fn(),
  }
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(performance, 'now').mockReturnValue(0)
  camera.aspect = 16 / 9
  void setCameraView(() => ({ target: new Vector3(), distance: 3000 }))
  setSceneData({ cardList: [], cardListWinAll: [], colCount: 20, rowCount: 25 })
})

afterEach(() => {
  rotateBallStop()
  vi.runOnlyPendingTimers()
  tweenGroup.removeAll()
  objects.length = 0
  Object.values(targets).forEach(list => { list.length = 0 })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
    const cameraDone = setCameraView(() => ({ target: new Vector3(), distance: 4000 }), 100)
    tweenGroup.update(101)
    await cameraDone
    expect(tweenGroup.getAll()).toHaveLength(0)
    // Follow the real reveal flow: finish the camera move before flying winners.
    const flightDone = cardFlyAnimation([0, 1])
    tweenGroup.update(1201)
    await flightDone
    expect(camera.position.z).toBe(4000)
    expect(objects.every(object => object.element.classList.contains('prize'))).toBe(true)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('keeps controls locked until winner placement finishes with reduced motion', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    addCards(10)
    const flight = cardFlyAnimation(Array.from({ length: 10 }, (_, index) => index))
    expect(controls.enabled).toBe(false)
    await Promise.resolve()
    expect(controls.enabled).toBe(false)
    tweenGroup.update(1)
    await flight
    expect(controls.enabled).toBe(true)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('keeps an empty draw at the current view without starting animations', async () => {
    const position = camera.position.clone()
    await cardFlyAnimation([])
    expect(camera.position.equals(position)).toBe(true)
    expect(controls.enabled).toBe(true)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('keeps a large winner group in front of the background and fully in frame', async () => {
    addCards(201)
    objects[200].position.z = 800
    const flight = cardFlyAnimation(Array.from({ length: 200 }, (_, index) => index))
    tweenGroup.update(1201)
    await flight
    expect(objects[0].position.z).toBeGreaterThan(800 + Math.hypot(140, 180) / 2)
    expect(controls.target.z).toBe(objects[0].position.z)
    camera.updateMatrixWorld(true)
    for (const object of objects.slice(0, 200)) {
      for (const x of [-70, 70]) {
        for (const y of [-90, 90]) {
          const corner = new Vector3(x, y, 0).add(object.position).project(camera)
          expect(Math.abs(corner.x)).toBeLessThan(1)
          expect(Math.abs(corner.y)).toBeLessThan(1)
        }
      }
    }
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('reflows winners if the viewport changes during flight or reset without drifting', async () => {
    addCards(10)
    const flight = cardFlyAnimation(Array.from({ length: 10 }, (_, index) => index))
    camera.aspect = 0.6
    tweenGroup.update(1201)
    await flight
    const narrowRows = new Set(objects.map(object => object.position.y)).size
    const plane = objects[0].position.z

    const reset = resetCameraView(100)
    tweenGroup.update(50)
    camera.aspect = 2.5
    tweenGroup.update(101)
    await reset
    expect(new Set(objects.map(object => object.position.y)).size).toBeLessThan(narrowRows)
    const positions = objects.map(object => object.position.toArray())
    const home = camera.position.clone()
    camera.position.set(2000, 3000, -500)
    await resetCameraView(0)
    expect(objects.map(object => object.position.toArray())).toEqual(positions)
    expect(camera.position.equals(home)).toBe(true)
    expect(controls.target.toArray()).toEqual([0, 0, plane])
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('cleans up repeated stopped spins without cancelling another animation', async () => {
    const position = { x: 0 }
    const animationDone = new Promise<void>(resolve => {
      new Tween(position, tweenGroup).to({ x: 4000 }, 1000).onComplete(() => resolve()).start()
    })
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
    await animationDone
    expect(position.x).toBe(4000)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('settles superseded camera moves and releases repeated reset tweens', async () => {
    const first = setCameraView(() => ({ target: new Vector3(), distance: 4000 }), 1000)
    tweenGroup.update(50)
    const target = new Vector3(100, 50, 20)
    const second = setCameraView(() => ({ target, distance: 2000 }), 100)
    await first
    expect(controls.enabled).toBe(false)
    expect(tweenGroup.getAll()).toHaveLength(1)

    tweenGroup.update(101)
    await second
    expect(camera.position.toArray()).toEqual([100, 50, 2020])
    expect(controls.target.toArray()).toEqual(target.toArray())
    expect(tweenGroup.getAll()).toHaveLength(0)

    for (let round = 0; round < 10; round++) {
      camera.position.x += 300
      const reset = resetCameraView(100)
      tweenGroup.update(101)
      await reset
      expect(controls.enabled).toBe(true)
      expect(camera.position.toArray()).toEqual([100, 50, 2020])
      expect(tweenGroup.getAll()).toHaveLength(0)
    }

    const interrupted = resetCameraView(1000)
    await resetCameraView(0)
    await interrupted
    tweenGroup.update(1001)
    expect(camera.position.toArray()).toEqual([100, 50, 2020])
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
