import { transform } from '../3d/3d-animate'
import type { TransformType } from '../3d/3d-animate'
import STATUS from '../3d/3d-status'
import { bus } from './event-bus'

// 待机轮播展示：自动循环切换 sphere/helix/grid/table 四种布局，
// 任意抽奖操作或再次点击按钮时停止。

const SEQUENCE: TransformType[] = ['sphere', 'helix', 'grid', 'table']
const TRANSFORM_DURATION = 1500
const STAY_MS = 6000 // 每种布局停留时长

// 依赖可注入，测试时不需要真实 3D 场景
export interface ShowcaseDeps {
  doTransform: (type: TransformType, duration: number) => Promise<void>
  wait: (ms: number) => Promise<void>
}

let active = false
let step = 0
let stayTimer = 0
let cancelWait: (() => void) | null = null

function defaultWait(ms: number): Promise<void> {
  return new Promise<void>(resolve => {
    cancelWait = resolve
    stayTimer = window.setTimeout(() => {
      cancelWait = null
      resolve()
    }, ms)
  })
}

const defaultDeps: ShowcaseDeps = {
  doTransform: (type, duration) => transform(type, duration),
  wait: defaultWait,
}

export function isShowcaseActive(): boolean {
  return active
}

export async function startShowcase(deps: ShowcaseDeps = defaultDeps): Promise<void> {
  if (active) {
    return void 0
  }
  active = true
  step = 0
  bus.emit('showcase-change')
  while (active) {
    const type = SEQUENCE[step % SEQUENCE.length]
    step++
    STATUS.setStatusRun() // 切换动画期间挡住抽奖入口
    await deps.doTransform(type, TRANSFORM_DURATION)
    STATUS.setStatusWait()
    if (!active) {
      break
    }
    await deps.wait(STAY_MS)
  }
}

export function stopShowcase(): void {
  if (!active) {
    return void 0
  }
  active = false
  if (stayTimer) {
    clearTimeout(stayTimer)
    stayTimer = 0
  }
  cancelWait?.() // 让停留中的循环立即退出
  cancelWait = null
  bus.emit('showcase-change')
}

// 手动停止轮播后回到 table 布局
export async function returnToTable(deps: ShowcaseDeps = defaultDeps): Promise<void> {
  STATUS.setStatusRun()
  await deps.doTransform('table', 1000)
  STATUS.setStatusWait()
}
