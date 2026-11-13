import { describe, it, expect } from 'vitest'
import { parseRosterEntries, rosterEntriesToText, rosterTextHints } from './config-store'
import type { RosterEntry } from './config-store'

const hasIdentityKey = (entries: RosterEntry[]) => entries.some(entry => 'employeeId' in entry || 'department' in entry)

// 设计 013“原型结论”列出的 9 种旧格式输入。期望值是基线 4f3b0a9 的 parseRosterEntries 输出。
const LEGACY: [string, string, RosterEntry[]][] = [
  ['纯名字', '张三\n李四', [{ name: '张三' }, { name: '李四' }]],
  ['名字,链接', '张三,https://a.com/a.png\n李四', [{ name: '张三', avatar: 'https://a.com/a.png' }, { name: '李四' }]],
  ['Excel 制表符', '张三\t研发部\n李四\t市场部', [{ name: '张三' }, { name: '李四' }]],
  ['名字,部门', '张三,研发部', [{ name: '张三' }]],
  ['全角逗号加 data URL', '张三，data:image/png;base64,AA,BB', [{ name: '张三', avatar: 'data:image/png;base64,AA,BB' }]],
  ['前后空白和空行', '  张三  \n\n  李四 \n', [{ name: '张三' }, { name: '李四' }]],
  ['首行恰好是“姓名”', '姓名\n张三', [{ name: '姓名' }, { name: '张三' }]],
  ['首行是“姓名,职级”', '姓名,职级\n张三,P7', [{ name: '姓名' }, { name: '张三' }]],
  ['带 BOM', '﻿张三\n李四', [{ name: '张三' }, { name: '李四' }]],
]

describe('名单解析：旧格式不变', () => {
  it.each(LEGACY)('%s', (_label, text, expected) => {
    const entries = parseRosterEntries(text)
    expect(entries).toEqual(expected)
    expect(hasIdentityKey(entries)).toBe(false)
    expect(rosterTextHints(text).headerMode).toBe(false)
  })

  it('没有身份列的名单回写文本与现在相同', () => {
    expect(rosterEntriesToText(['张三', { name: '李四', avatar: 'https://a.com/b.png' }])).toBe('张三\n李四,https://a.com/b.png')
  })
})

describe('名单解析：表头模式', () => {
  it('中文表头：姓名、工号、部门', () => {
    expect(parseRosterEntries('姓名,工号,部门\n张伟,A001,研发部\n张伟,A002,市场部')).toEqual([
      { name: '张伟', employeeId: 'A001', department: '研发部' },
      { name: '张伟', employeeId: 'A002', department: '市场部' },
    ])
  })

  it('英文表头不分大小写，列顺序随意', () => {
    expect(parseRosterEntries('Name,Department,EMPLOYEE_ID\n张伟,研发部,A001')).toEqual([
      { name: '张伟', employeeId: 'A001', department: '研发部' },
    ])
    expect(parseRosterEntries('name,employee_id\nAlice,7')).toEqual([{ name: 'Alice', employeeId: '7' }])
  })

  it('“名字”“编号”是姓名、工号的别名', () => {
    expect(parseRosterEntries('名字,编号\n张三,B9')).toEqual([{ name: '张三', employeeId: 'B9' }])
  })

  it('Excel 制表符粘贴', () => {
    expect(parseRosterEntries('姓名\t工号\t部门\r\n张三\tA1\t研发部')).toEqual([{ name: '张三', employeeId: 'A1', department: '研发部' }])
  })

  it('全角逗号与 BOM', () => {
    expect(parseRosterEntries('﻿姓名，部门\n张三，研发部')).toEqual([{ name: '张三', department: '研发部' }])
  })

  it('表头前的空行跳过，表头之后的空行忽略', () => {
    expect(parseRosterEntries('\n\n姓名,工号\n\n张三,A1\n')).toEqual([{ name: '张三', employeeId: 'A1' }])
  })

  it('未知列被忽略', () => {
    expect(parseRosterEntries('姓名,职级,工号\n张三,P7,A1')).toEqual([{ name: '张三', employeeId: 'A1' }])
  })

  it('行比表头短时缺的列按空处理，空值不写入', () => {
    expect(parseRosterEntries('姓名,工号,部门\n张三\n李四,,市场部\n王五,A3')).toEqual([
      { name: '张三' },
      { name: '李四', department: '市场部' },
      { name: '王五', employeeId: 'A3' },
    ])
  })

  it('头像列在最后时取整段，data URL 中的逗号不被切开', () => {
    expect(parseRosterEntries('姓名,工号,头像\n张三,A1,data:image/png;base64,AA,BB\n李四,A2,不是链接')).toEqual([
      { name: '张三', employeeId: 'A1', avatar: 'data:image/png;base64,AA,BB' },
      { name: '李四', employeeId: 'A2' },
    ])
    expect(parseRosterEntries('name,avatar\nBob,https://a.com/b.png')).toEqual([{ name: 'Bob', avatar: 'https://a.com/b.png' }])
  })

  it('姓名为空的行丢弃，单元格去空白', () => {
    expect(parseRosterEntries('姓名,工号\n ,A1\n 张三 , A2 ')).toEqual([{ name: '张三', employeeId: 'A2' }])
  })

  it('首格不是姓名类关键字时不进入表头模式', () => {
    expect(parseRosterEntries('工号,姓名\nA1,张三')).toEqual([{ name: '工号' }, { name: 'A1' }])
  })

  it('不改变名单顺序', () => {
    const names = parseRosterEntries('姓名,工号\n丙,3\n甲,1\n乙,2').map(entry => entry.name)
    expect(names).toEqual(['丙', '甲', '乙'])
  })
})

describe('名单回写文本：往返', () => {
  it('有身份列时输出表头，再解析得到相同数据', () => {
    const roster: RosterEntry[] = [
      { name: '张伟', employeeId: 'A001', department: '研发部' },
      { name: '张伟', employeeId: 'A002' },
      { name: '李娜', department: '市场部', avatar: 'data:image/png;base64,AA,BB' },
      { name: '王五' },
    ]
    const text = rosterEntriesToText(roster)
    expect(text.split('\n')[0]).toBe('姓名,工号,部门,头像')
    expect(parseRosterEntries(text)).toEqual(roster)
  })

  it('只有工号、没有头像时表头不带头像列', () => {
    const text = rosterEntriesToText(['张三', { name: '李四', employeeId: 'A2' }])
    expect(text).toBe('姓名,工号,部门\n张三,,\n李四,A2,')
    expect(parseRosterEntries(text)).toEqual([{ name: '张三' }, { name: '李四', employeeId: 'A2' }])
  })
})

describe('rosterTextHints', () => {
  it('重复工号按首次出现顺序列出次数', () => {
    expect(rosterTextHints('姓名,工号\n张三,A1\n李四,A2\n王五,A1\n赵六,A2\n钱七,A1').duplicateEmployeeIds).toEqual([
      { id: 'A1', count: 3 }, { id: 'A2', count: 2 },
    ])
  })

  it('多列但没有表头时提示附加列被忽略', () => {
    expect(rosterTextHints('张三,研发部\n李四').ignoredColumns).toBe(true)
    expect(rosterTextHints('张三\t研发部').ignoredColumns).toBe(true)
  })

  it('只有头像列、纯名字或表头模式时不提示', () => {
    expect(rosterTextHints('张三,https://a.com/a.png\n李四').ignoredColumns).toBe(false)
    expect(rosterTextHints('张三\n李四').ignoredColumns).toBe(false)
    const header = rosterTextHints('姓名,部门\n张三,研发部')
    expect(header.headerMode).toBe(true)
    expect(header.ignoredColumns).toBe(false)
    expect(header.duplicateEmployeeIds).toEqual([])
  })
})
