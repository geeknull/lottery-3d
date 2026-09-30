import { beforeEach, describe, expect, it, vi } from 'vitest'

let status: typeof import('./lottery-status')['default']
let bus: typeof import('./event-bus')['bus']

beforeEach(async () => {
  vi.resetModules()
  ;({ default: status } = await import('./lottery-status'))
  ;({ bus } = await import('./event-bus'))
})

describe('统一阶段状态', () => {
  it('旧的 busy/wait 视图从阶段派生，定格时允许下一轮操作', () => {
    expect(status.getPhase()).toBe('init')
    expect(status.getStatus()).toBe(status.INIT)
    for (const phase of ['preparing', 'spinning', 'revealing', 'transitioning'] as const) {
      status.setPhase(phase)
      expect(status.isRun()).toBe(true)
      expect(status.isWait()).toBe(false)
    }
    status.setPhase('presenting')
    expect(status.isWait()).toBe(true)
    status.setStatusRun()
    expect(status.getPhase()).toBe('transitioning')
    status.setStatusWait()
    expect(status.getPhase()).toBe('idle')
  })

  it('phase 和旋转通知来自同一次状态变化，重复赋值不广播', () => {
    const phaseChanges = vi.fn()
    const spinChanges = vi.fn()
    const unsubscribe = status.subscribe(phaseChanges)
    bus.on('spin-change', spinChanges)
    status.setPhase('preparing')
    status.setPhase('spinning')
    status.setPhase('spinning')
    status.setPhase('revealing')
    expect(phaseChanges).toHaveBeenCalledTimes(3)
    expect(spinChanges.mock.calls).toEqual([[true], [false]])
    unsubscribe()
    status.setPhase('presenting')
    expect(phaseChanges).toHaveBeenCalledTimes(3)
  })
})
