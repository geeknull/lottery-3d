import { describe, it, expect } from 'vitest'
import { toHistoryRows, historyToCsv } from './lottery-history'
import type { DrawLogEntry } from './lottery-types'

const log: DrawLogEntry[] = [
  { type: 'draw', at: 1000, prizeId: '一等奖', prizeName: '一等奖', winnerNames: ['张三', '李四'], winnerIds: ['张三', '李四'] },
  { type: 'void', at: 2000, prizeId: '一等奖', prizeName: '一等奖', winnerNames: ['张三'], winnerIds: ['张三'], note: '不再参与' },
  { type: 'draw', at: 3000, prizeId: '一等奖', prizeName: '一等奖', winnerNames: ['王五'], winnerIds: ['王五'] },
]

describe('toHistoryRows', () => {
  it('最新操作排在最前（倒序）', () => {
    const rows = toHistoryRows(log)
    expect(rows.map(r => r.at)).toEqual([3000, 2000, 1000])
  })

  it('类型转为中文标签', () => {
    const rows = toHistoryRows(log)
    expect(rows.find(r => r.type === 'draw')!.typeLabel).toBe('抽奖')
    expect(rows.find(r => r.type === 'void')!.typeLabel).toBe('作废')
  })

  it('时间格式化为 HH:MM:SS', () => {
    expect(toHistoryRows(log)[0].time).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('携带人名与备注', () => {
    const rows = toHistoryRows(log)
    expect(rows.find(r => r.type === 'void')!.names).toEqual(['张三'])
    expect(rows.find(r => r.type === 'void')!.note).toBe('不再参与')
  })
})

describe('historyToCsv', () => {
  it('含表头且每个涉及的人一行', () => {
    const csv = historyToCsv(log)
    const lines = csv.replace('﻿', '').split('\n')
    expect(lines[0]).toBe('时间,操作,奖项,姓名,备注')
    // 2(draw) + 1(void) + 1(draw) = 4 条数据行
    expect(lines).toHaveLength(5)
  })

  it('带 BOM 便于 Excel 正确识别中文', () => {
    expect(historyToCsv(log).startsWith('﻿')).toBe(true)
  })

  it('空流水只有表头', () => {
    expect(historyToCsv([]).replace('﻿', '')).toBe('时间,操作,奖项,姓名,备注')
  })
})
