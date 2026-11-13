import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBackupReminder, dismissBackupReminder, isBackupReminderDismissed, resetBackupReminder } from './backup-reminder'

afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  resetBackupReminder()
})

describe('createBackupReminder', () => {
  it('奖项抽完时提醒一次，作废后补抽再次抽完不重复', () => {
    const reminder = createBackupReminder([{ id: 'a', countRemain: 2 }, { id: 'b', countRemain: 1 }])
    expect(reminder.check([{ id: 'a', countRemain: 1 }, { id: 'b', countRemain: 1 }])).toEqual([])
    expect(reminder.check([{ id: 'a', countRemain: 0 }, { id: 'b', countRemain: 1 }])).toEqual(['a'])
    expect(reminder.check([{ id: 'a', countRemain: 0 }, { id: 'b', countRemain: 1 }])).toEqual([])
    expect(reminder.check([{ id: 'a', countRemain: 1 }, { id: 'b', countRemain: 1 }])).toEqual([])
    expect(reminder.check([{ id: 'a', countRemain: 0 }, { id: 'b', countRemain: 1 }])).toEqual([])
  })

  it('启动时已经抽完的奖项不提醒；同时抽完多个按奖项顺序返回；旧配置的负余额也算抽完', () => {
    const reminder = createBackupReminder([{ id: 'done', countRemain: 0 }, { id: 'x', countRemain: 1 }, { id: 'y', countRemain: 1.5 }])
    expect(reminder.check([{ id: 'done', countRemain: 0 }, { id: 'x', countRemain: 0 }, { id: 'y', countRemain: -0.5 }])).toEqual(['x', 'y'])
  })
})

describe('本场不再提醒', () => {
  it('按种子生效，刷新后（模块状态清空）仍从 sessionStorage 读到', () => {
    expect(isBackupReminderDismissed(7)).toBe(false)
    dismissBackupReminder(7)
    expect(isBackupReminderDismissed(7)).toBe(true)
    expect(isBackupReminderDismissed(8)).toBe(false)
    resetBackupReminder()
    expect(isBackupReminderDismissed(7)).toBe(true)
  })

  it('sessionStorage 抛错时退回内存', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    expect(isBackupReminderDismissed(7)).toBe(false)
    dismissBackupReminder(7)
    expect(isBackupReminderDismissed(7)).toBe(true)
  })
})
