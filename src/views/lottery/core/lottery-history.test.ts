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

  it('转义公式前缀、逗号和引号', () => {
    const csv = historyToCsv([{
      type: 'void', at: 1000, prizeId: 'a', prizeName: '一等奖,特别',
      winnerNames: ['=1+1', '张"三'], winnerIds: ['x', 'y'], note: '=备注',
    }])
    const lines = csv.replace('﻿', '').split('\n')
    expect(lines[1].endsWith(`,作废,"一等奖,特别",'=1+1,'=备注`)).toBe(true)
    expect(lines[2].endsWith(`,作废,"一等奖,特别","张""三",'=备注`)).toBe(true)
  })

  it('名单有身份信息时在末尾追加工号、部门，按 winnerIds 查卡片，工号公式前缀被中和', () => {
    const card = (name: string, id: string, extra = {}) => ({ name, id, avatar: '', index: 0, row: 1, col: 1, ...extra })
    const roster = [card('张三', '张三', { employeeId: '+A01', department: '研发部' }), card('李四', '李四'), card('王五', '王五', { employeeId: 'A03' })]
    const lines = historyToCsv(log, roster).replace('\uFEFF', '').split('\n')
    expect(lines[0]).toBe('时间,操作,奖项,姓名,备注,工号,部门')
    expect(lines[1].endsWith(",抽奖,一等奖,张三,,'+A01,研发部")).toBe(true)
    expect(lines[2].endsWith(',抽奖,一等奖,李四,,,')).toBe(true)
    expect(lines[3].endsWith(",作废,一等奖,张三,不再参与,'+A01,研发部")).toBe(true)
    expect(lines[4].endsWith(',抽奖,一等奖,王五,,A03,')).toBe(true)
  })

  it('名单没有身份信息时与不传名单完全相同', () => {
    const card = (name: string) => ({ name, id: name, avatar: '', index: 0, row: 1, col: 1 })
    expect(historyToCsv(log, [card('张三'), card('李四'), card('王五')])).toBe(historyToCsv(log))
  })
})
