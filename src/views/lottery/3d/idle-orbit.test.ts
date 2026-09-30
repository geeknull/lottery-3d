import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { camera, controls } from './3d-core'
import { resetCameraView, setCameraView } from './3d-camera-view'
import { prepareSpin } from './3d-action'
import { tweenGroup } from './tween-group'
import { disposeIdleOrbit, initIdleOrbit, setIdleAllowed, setIdleLayout, updateIdleOrbit } from './idle-orbit'

vi.mock('./3d-core', () => {
  const controls = { enabled: true, target: new Vector3() }
  return {
    camera: new PerspectiveCamera(40, 16 / 9, 1, 10000), controls,
    initControls: (target: Vector3) => { controls.target.copy(target); controls.enabled = true },
    render: vi.fn(),
  }
})

let reducedMotion = false
let time = 0
let surface: HTMLElement
beforeEach(() => {
  reducedMotion = false
  time = 0
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ get matches() { return reducedMotion } })))
  surface = document.createElement('div')
  initIdleOrbit(surface)
  void setCameraView(() => ({ target: new Vector3(), distance: 3000 }))
  setIdleLayout('sphere')
  setIdleAllowed(true)
})
afterEach(() => {
  disposeIdleOrbit()
  tweenGroup.removeAll()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function orbitFrame(at: number) { time = at; updateIdleOrbit(at) }

describe('sphere idle camera orbit', () => {
  it('moves slowly only for an idle sphere and keeps the same target and radius', () => {
    orbitFrame(0)
    orbitFrame(100)
    expect(camera.position.x).toBeGreaterThan(0)
    expect(camera.position.x).toBeLessThan(11)
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(3000)
    for (const layout of ['table', 'helix', 'grid']) {
      setIdleLayout(layout)
      const position = camera.position.clone()
      orbitFrame(time + 100)
      orbitFrame(time + 100)
      expect(camera.position.equals(position)).toBe(true)
    }
    setIdleLayout('sphere')
    setIdleAllowed(false) // preparing, spinning and presenting never orbit.
    const position = camera.position.clone()
    orbitFrame(time + 100)
    orbitFrame(time + 100)
    expect(camera.position.equals(position)).toBe(true)
  })

  it.each(['pointerdown', 'wheel'])('pauses before a %s gesture until a new sphere layout', event => {
    orbitFrame(0)
    orbitFrame(100)
    surface.dispatchEvent(new Event(event))
    const position = camera.position.clone()
    orbitFrame(200)
    orbitFrame(300)
    expect(camera.position.equals(position)).toBe(true)
    setIdleLayout('sphere')
    orbitFrame(400)
    orbitFrame(500)
    expect(camera.position.equals(position)).toBe(false)
  })

  it('leaves explicit reset stable even after the application returns to idle', async () => {
    orbitFrame(0)
    orbitFrame(100)
    await resetCameraView(0)
    setIdleAllowed(false)
    setIdleAllowed(true)
    orbitFrame(200)
    orbitFrame(300)
    expect(camera.position.toArray()).toEqual([0, 0, 3000])
  })

  it('settles an orbiting camera onto the draw axis continuously and adds no delay when aligned', async () => {
    orbitFrame(0)
    orbitFrame(100)
    const start = camera.position.x
    const prepared = prepareSpin()
    expect(camera.position.x).toBe(start)
    time = 425
    tweenGroup.update(time)
    expect(camera.position.x).toBeGreaterThan(0)
    expect(camera.position.x).toBeLessThan(start)
    time = 750
    tweenGroup.update(time)
    await prepared
    expect(camera.position.toArray()).toEqual([0, 0, 3000])
    await prepareSpin()
    expect(tweenGroup.getAll()).toHaveLength(0)
  })

  it('respects reduced motion and removes its input listeners on disposal', async () => {
    reducedMotion = true
    orbitFrame(0)
    orbitFrame(100)
    expect(camera.position.toArray()).toEqual([0, 0, 3000])
    camera.position.x = 500
    await prepareSpin()
    expect(camera.position.toArray()).toEqual([0, 0, 3000])
    expect(tweenGroup.getAll()).toHaveLength(0)
    const remove = vi.spyOn(surface, 'removeEventListener')
    disposeIdleOrbit()
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(remove).toHaveBeenCalledWith('wheel', expect.any(Function), true)
    reducedMotion = false
    orbitFrame(200)
    orbitFrame(300)
    expect(camera.position.toArray()).toEqual([0, 0, 3000])
  })
})
