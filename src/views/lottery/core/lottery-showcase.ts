import { cancelLayout, transform } from '../3d/3d-animate'
import type { TransformType } from '../3d/3d-animate'
import STATUS from './lottery-status'
import { bus } from './event-bus'
import { toast } from '../components/feedback'

const SEQUENCE: TransformType[] = ['sphere', 'helix', 'grid', 'table']
const TRANSFORM_DURATION = 1500
const STAY_MS = 6000

export interface ShowcaseDeps {
  doTransform: (type: TransformType, duration: number) => Promise<void>
  wait: (ms: number) => Promise<void>
}

let active = false
let generation = 0
let layoutOwner: number | null = null
let stayTimer = 0
let cancelWait: (() => void) | null = null

function defaultWait(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    cancelWait = resolve
    stayTimer = window.setTimeout(() => {
      cancelWait = null
      stayTimer = 0
      resolve()
    }, ms)
  })
}

const defaultDeps: ShowcaseDeps = {
  doTransform: (type, duration) => transform(type, duration),
  wait: defaultWait,
}

export function isShowcaseActive(): boolean { return active }

// 轮播和停止后的归位共享所有权。新命令先终止这里的布局与计时器，
// 被取消 Tween 的 Promise 即使随后 resolve，也不再有权更改抽奖阶段。
export function stopShowcase(): void {
  generation++
  const wasActive = active
  active = false
  const ownedLayout = layoutOwner !== null
  layoutOwner = null
  if (stayTimer) clearTimeout(stayTimer)
  stayTimer = 0
  const finishWait = cancelWait
  cancelWait = null
  finishWait?.()
  if (ownedLayout) {
    cancelLayout()
    if (STATUS.getPhase() === 'transitioning') STATUS.setStatusWait()
  }
  if (wasActive) bus.emit('showcase-change')
}

export async function startShowcase(deps: ShowcaseDeps = defaultDeps): Promise<void> {
  if (active || !STATUS.isWait()) return
  const owner = ++generation
  active = true
  bus.emit('showcase-change')
  let step = 0
  try {
    while (active && generation === owner) {
      if (!STATUS.isWait()) break
      layoutOwner = owner
      STATUS.setStatusRun()
      await deps.doTransform(SEQUENCE[step++ % SEQUENCE.length], TRANSFORM_DURATION)
      if (generation !== owner) return
      layoutOwner = null
      if (STATUS.getPhase() !== 'transitioning') return
      STATUS.setStatusWait()
      await deps.wait(STAY_MS)
    }
  } catch {
    if (generation === owner) toast('轮播展示未完成，请重试')
  } finally {
    if (generation === owner) stopShowcase()
  }
}

export async function returnToTable(deps: ShowcaseDeps = defaultDeps): Promise<void> {
  stopShowcase()
  if (!STATUS.isWait()) return
  const owner = ++generation
  layoutOwner = owner
  STATUS.setStatusRun()
  try {
    await deps.doTransform('table', 1000)
  } catch {
    if (generation === owner) toast('平铺展示未完成，请重试')
  } finally {
    if (generation === owner) {
      layoutOwner = null
      if (STATUS.getPhase() === 'transitioning') STATUS.setStatusWait()
    }
  }
}
