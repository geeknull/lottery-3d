import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Object3D, PerspectiveCamera, Scene, Vector3 } from 'three'
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js'
import { revealWinners, finishReveal, showWinnerGroup, rotateBall, disposeActions } from './3d-action'
import { camera, controls, objects, targets } from './3d-core'
import { setCameraView } from './3d-camera-view'
import { tweenGroup } from './tween-group'

vi.mock('./3d-core', () => {
  const controls = { enabled: true, target: new Vector3() }
  const camera = new PerspectiveCamera(40, 16 / 9, 1, 10000)
  return {
    camera, scene: new Scene(), controls,
    initControls: vi.fn((target: Vector3) => { controls.target.copy(target); controls.enabled = true }),
    objects: [], targets: { table: [], sphere: [], helix: [], grid: [] },
    cardSize: { width: 140, height: 180, padding: 20 },
    getContainerWidth: () => 1200, getContainerHeight: () => 700, render: vi.fn(),
  }
})

let time = 0
async function frame(at: number) {
  time = at
  tweenGroup.update(time)
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  time = 0
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  document.body.innerHTML = '<div id="container"></div>'
  void setCameraView(() => ({ target: new Vector3(), distance: 3000 }))
  for (let index = 0; index < 13; index++) {
    const object = new CSS3DObject(document.createElement('div'))
    object.element.dataset.cardId = String(index)
    object.position.set(index * 10, index * 20, 800)
    objects.push(object)
    const target = new Object3D()
    target.position.copy(object.position)
    targets.sphere.push(target)
  }
})

afterEach(() => {
  disposeActions()
  tweenGroup.removeAll()
  objects.length = 0
  Object.values(targets).forEach(list => { list.length = 0 })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fixed-result reveal choreography', () => {
  it('accelerates continuously and holds a still composition after stop, pause and flight', async () => {
    rotateBall()
    await frame(100)
    const early = Math.atan2(camera.position.x, camera.position.z)
    await frame(200)
    const later = Math.atan2(camera.position.x, camera.position.z)
    expect(later - early).toBeGreaterThan(early)
    const reveal = revealWinners([1, 4, 7])
    expect(document.querySelector('#container')?.getAttribute('data-stage-phase')).toBe('settling')
    for (const at of [1500, 3000, 3300, 5000]) await frame(at)
    await reveal
    expect(controls.enabled).toBe(true)
    expect(objects.filter(o => o.element.classList.contains('winner-current'))).toEqual([objects[1], objects[4], objects[7]])
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('skip during deceleration settles the original promise and fixes the supplied winners', async () => {
    rotateBall()
    await frame(1000)
    const reveal = revealWinners([2, 8])
    await frame(1100)
    await finishReveal([2, 8])
    await reveal
    const positions = objects.map(object => object.position.clone())
    await frame(5000)
    expect(objects.every((object, index) => object.position.equals(positions[index]))).toBe(true)
    expect(objects.filter(o => o.element.classList.contains('winner-current'))).toEqual([objects[2], objects[8]])
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('replay and group closeups preserve the fixed winning set', async () => {
    const winners = Array.from({ length: 13 }, (_, index) => index)
    await finishReveal(winners)
    const replay = revealWinners(winners, { replay: true })
    await frame(0)
    await frame(400)
    await frame(2000)
    await replay
    const group = showWinnerGroup(1)
    await frame(3000)
    await group
    expect(objects.filter(o => o.visible)).toEqual(objects.slice(5, 9))
    const overview = showWinnerGroup(null)
    await frame(4000)
    await overview
    expect(objects.every(o => o.visible && o.element.classList.contains('winner-current'))).toBe(true)
  })

  it('restores the entire sphere before replaying a fixed result from another layout', async () => {
    await finishReveal([0, 5])
    objects.forEach((object, index) => {
      object.position.set(index * 200, 600, 0)
      object.rotation.set(0.4, 0.6, 0.2)
    })
    objects[1].visible = false
    targets.sphere[1].rotation.set(0.2, -0.4, 0.1)

    const replay = revealWinners([0, 5], { replay: true })
    expect(objects.every((object, index) => object.position.equals(targets.sphere[index].position))).toBe(true)
    expect(objects.every((object, index) => object.quaternion.equals(targets.sphere[index].quaternion))).toBe(true)
    expect(objects.every(object => object.visible)).toBe(true)
    await frame(0)
    await frame(400)
    await frame(2000)
    await replay
    expect(objects[1].position.equals(targets.sphere[1].position)).toBe(true)
    expect(objects[1].quaternion.equals(targets.sphere[1].quaternion)).toBe(true)
    expect(objects.filter(object => object.element.classList.contains('winner-current'))).toEqual([objects[0], objects[5]])
  })

  it.each([
    { presentation: 'standard', pause: 220, finish: 1120 },
    { presentation: 'ceremonial', pause: 500, finish: 1750 },
  ] as const)('keeps the $presentation replay tempo through pause and final framing', async ({ presentation, pause, finish }) => {
    const replay = revealWinners([0], { replay: true, presentation })
    const phase = () => document.querySelector('#container')?.getAttribute('data-stage-phase')
    await frame(0)
    await frame(pause - 1)
    expect(phase()).toBe('anticipation')
    await frame(pause)
    expect(phase()).toBe('revealing')
    await frame(finish - 1)
    expect(phase()).toBe('revealing')
    expect(controls.enabled).toBe(false)
    await frame(finish)
    await replay
    expect(phase()).toBe('presenting')
    expect(controls.enabled).toBe(true)
  })

  it.each([
    { presentation: 'standard', settle: 650 },
    { presentation: 'ceremonial', settle: 850 },
  ] as const)('uses the $presentation early-stop settling time', async ({ presentation, settle }) => {
    rotateBall()
    await frame(200)
    const reveal = revealWinners([0], { presentation })
    await frame(200 + settle - 1)
    expect(document.querySelector('#container')?.getAttribute('data-stage-phase')).toBe('settling')
    await frame(200 + settle)
    expect(document.querySelector('#container')?.getAttribute('data-stage-phase')).toBe('anticipation')
    await finishReveal([0])
    await reveal
  })

  it('abort cancels every reveal tween without leaving a late camera or card mutation', async () => {
    const abort = new AbortController()
    const reveal = revealWinners([0, 1], { signal: abort.signal, replay: true })
    await frame(300)
    abort.abort()
    await reveal
    const cameraPosition = camera.position.clone()
    const cardPosition = objects[0].position.clone()
    await frame(4000)
    expect(camera.position.equals(cameraPosition)).toBe(true)
    expect(objects[0].position.equals(cardPosition)).toBe(true)
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it.each(['standard', 'ceremonial'] as const)('reduced motion skips the entire %s presentation', async presentation => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    rotateBall()
    expect(tweenGroup.getAll()).toHaveLength(0)
    await revealWinners([0, 5], { presentation })
    expect(tweenGroup.getAll()).toHaveLength(0)
    expect(camera.position.x).toBe(0)
    expect(objects[0].rotation.toArray().slice(0, 3)).toEqual([0, 0, 0])
    expect(controls.enabled).toBe(true)
  })
})
