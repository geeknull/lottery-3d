import { describe, it, expect } from 'vitest'
import { parseRosterText, parseRosterEntries, normalizeRoster, parseConfigJson, configHash } from './config-store'
import type { UserLotteryConfig } from './config-store'

const validConfig: UserLotteryConfig = {
  version: 1,
  headerTitle: '测试抽奖',
  prizes: [{ name: '一等奖', count: 2, everyTimeGet: 1 }],
  roster: ['张三', '李四', '王五'],
}

describe('parseRosterText', () => {
  it('按行拆分名字并去掉空行', () => {
    expect(parseRosterText('张三\n李四\n\n王五\n')).toEqual(['张三', '李四', '王五'])
  })

  it('支持 Windows 换行符', () => {
    expect(parseRosterText('张三\r\n李四')).toEqual(['张三', '李四'])
  })

  it('一行含逗号/制表符/中文逗号时只取第一列', () => {
    expect(parseRosterText('张三,研发部\n李四\t市场部\n王五，行政部')).toEqual(['张三', '李四', '王五'])
  })

  it('去掉名字两端空白', () => {
    expect(parseRosterText('  张三  \n李四')).toEqual(['张三', '李四'])
  })
})

describe('parseRosterEntries', () => {
  it('第二列是 http/data 链接时识别为头像', () => {
    const entries = parseRosterEntries('张三,https://example.com/a.png\n李四,data:image/png;base64,xx\n王五')
    expect(entries).toEqual([
      { name: '张三', avatar: 'https://example.com/a.png' },
      { name: '李四', avatar: 'data:image/png;base64,xx' },
      { name: '王五' },
    ])
  })

  it('第二列不是链接时按 Excel 多列粘贴处理（忽略）', () => {
    const entries = parseRosterEntries('张三,研发部\n李四\t市场部')
    expect(entries).toEqual([{ name: '张三' }, { name: '李四' }])
  })

  it('空行过滤、名字去空白', () => {
    expect(parseRosterEntries(' 张三 \n\n李四,https://a.com/b.jpg ')).toEqual([
      { name: '张三' },
      { name: '李四', avatar: 'https://a.com/b.jpg' },
    ])
  })
})

describe('normalizeRoster', () => {
  it('字符串与对象混合的名单统一成对象形态', () => {
    expect(normalizeRoster(['张三', { name: '李四', avatar: 'https://a.com/b.png' }])).toEqual([
      { name: '张三' },
      { name: '李四', avatar: 'https://a.com/b.png' },
    ])
  })
})

describe('parseConfigJson', () => {
  it('合法配置解析成功', () => {
    expect(parseConfigJson(JSON.stringify(validConfig))).toEqual(validConfig)
  })

  it('非法 JSON 返回 null', () => {
    expect(parseConfigJson('{not json')).toBeNull()
  })

  it('缺字段返回 null', () => {
    const { roster: _roster, ...rest } = validConfig
    expect(parseConfigJson(JSON.stringify(rest))).toBeNull()
  })

  it('空名单返回 null', () => {
    expect(parseConfigJson(JSON.stringify({ ...validConfig, roster: [] }))).toBeNull()
  })

  it('空奖项列表返回 null', () => {
    expect(parseConfigJson(JSON.stringify({ ...validConfig, prizes: [] }))).toBeNull()
  })

  it('奖项数量小于 1 返回 null', () => {
    const bad = { ...validConfig, prizes: [{ name: '一等奖', count: 0, everyTimeGet: 1 }] }
    expect(parseConfigJson(JSON.stringify(bad))).toBeNull()
  })

  it('版本号不对返回 null', () => {
    expect(parseConfigJson(JSON.stringify({ ...validConfig, version: 2 }))).toBeNull()
  })

  it('名单条目可以是带头像的对象，混合形态也合法', () => {
    const mixed = {
      ...validConfig,
      roster: ['张三', { name: '李四', avatar: 'https://example.com/a.png' }],
    }
    expect(parseConfigJson(JSON.stringify(mixed))).not.toBeNull()
    const badEntry = { ...validConfig, roster: [{ avatar: 'https://a.com/b.png' }] } // 缺 name
    expect(parseConfigJson(JSON.stringify(badEntry))).toBeNull()
  })

  it('奖项可带可选的奖品图（img），非字符串则拒绝', () => {
    const withImg = {
      ...validConfig,
      prizes: [{ name: '一等奖', count: 2, everyTimeGet: 1, img: 'data:image/jpeg;base64,xxx' }],
    }
    expect(parseConfigJson(JSON.stringify(withImg))?.prizes[0].img).toBe('data:image/jpeg;base64,xxx')
    const badImg = {
      ...validConfig,
      prizes: [{ name: '一等奖', count: 2, everyTimeGet: 1, img: 123 }],
    }
    expect(parseConfigJson(JSON.stringify(badImg))).toBeNull()
  })
})

describe('configHash', () => {
  it('相同配置指纹一致', () => {
    const a = configHash('标题', validConfig.prizes, validConfig.roster)
    const b = configHash('标题', validConfig.prizes, validConfig.roster)
    expect(a).toBe(b)
  })

  it('名单变化时指纹变化', () => {
    const a = configHash('标题', validConfig.prizes, ['张三'])
    const b = configHash('标题', validConfig.prizes, ['李四'])
    expect(a).not.toBe(b)
  })

  it('奖项变化时指纹变化', () => {
    const a = configHash('标题', [{ name: '一等奖', count: 1, everyTimeGet: 1 }], validConfig.roster)
    const b = configHash('标题', [{ name: '一等奖', count: 2, everyTimeGet: 1 }], validConfig.roster)
    expect(a).not.toBe(b)
  })

  it('头像变化不影响指纹（换头像不重置抽奖进度）', () => {
    const a = configHash('标题', validConfig.prizes, ['张三', '李四'])
    const b = configHash('标题', validConfig.prizes, [{ name: '张三', avatar: 'https://a.com/x.png' }, '李四'])
    expect(a).toBe(b)
  })

  it('奖品图变化不影响指纹（换图不重置抽奖进度）', () => {
    const a = configHash('标题', [{ name: '一等奖', count: 1, everyTimeGet: 1 }], validConfig.roster)
    const b = configHash('标题', [{ name: '一等奖', count: 1, everyTimeGet: 1, img: 'data:image/jpeg;base64,xxx' }], validConfig.roster)
    expect(a).toBe(b)
  })
})
