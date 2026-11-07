# Plan 006: 抽奖流水 CSV 转义单元格内容

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-history.ts src/views/lottery/core/lottery-history.test.ts e2e/lottery.spec.ts`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

中奖名单 CSV 已经做了转义，抽奖流水 CSV 却直接拼接文本。实测奖项名 `一等奖,特别` 会把一列撑成两列，`=1+1` 这样的名字原样进入文件，在 Excel 或 WPS 打开时可能被当成公式。名单和配置可以从别人那里导入，所以这是真实的输入路径。修完后两种导出的安全处理一致。

## Current state

`src/views/lottery/core/lottery-history.ts:49-59`：

```ts
// 导出完整流水 CSV（每个涉及的人一行，带时间戳）
export function historyToCsv(drawLog: DrawLogEntry[]): string {
  const rows = ['时间,操作,奖项,姓名,备注']
  drawLog.forEach(e => {
    const label = TYPE_LABEL[e.type]
    e.winnerNames.forEach(name => {
      rows.push(`${formatDateTime(e.at)},${label},${e.prizeName},${name},${e.note ?? ''}`)
    })
  })
  return '﻿' + rows.join('\n') // BOM
}
```

`src/views/lottery/core/config-store.ts:166-172` 已有转义函数，要复用：

```ts
// CSV 单元格转义：
// 1) = + - @ 开头会被 Excel/WPS 当公式执行（CSV 注入 CWE-1236），前置单引号中和；
// 2) 含逗号/引号/换行时按 RFC 4180 用双引号包裹、内部引号翻倍，避免撑破列。
export function escapeCsvCell(value: string): string {
```

`config-store.ts` 只依赖 `./rehearsal` 和类型，`lottery-history.ts` 引入它不会形成循环依赖。

约定：`lottery-history.ts` 不用分号。测试参考 `lottery-history.test.ts` 现有写法。E2E 参考 `e2e/lottery.spec.ts:180-216` 的「中奖名单 CSV 导出」。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/lottery-history.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| E2E 过滤 | `pnpm e2e e2e/lottery.spec.ts -g "CSV"` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/lottery-history.ts`
- `src/views/lottery/core/lottery-history.test.ts`
- `e2e/lottery.spec.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `src/views/lottery/core/config-store.ts`：`escapeCsvCell` 不用改。
- CSV 的列结构：不要增减列。
- 重复的下载函数：本计划不合并。

## Git workflow

- 分支：`advisor/006-history-csv-escape`
- 提交信息用中文并带前缀，例如 `fix: 抽奖流水 CSV 转义公式和分隔符`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

在 `lottery-history.test.ts` 的 `describe('historyToCsv')` 里加：

```ts
  it('转义公式前缀、逗号和引号', () => {
    const csv = historyToCsv([{
      type: 'void', at: 1000, prizeId: 'a', prizeName: '一等奖,特别',
      winnerNames: ['=1+1', '张"三'], winnerIds: ['x', 'y'], note: '=备注',
    }])
    const lines = csv.replace('﻿', '').split('\n')
    expect(lines[1].endsWith(`,作废,"一等奖,特别",'=1+1,'=备注`)).toBe(true)
    expect(lines[2].endsWith(`,作废,"一等奖,特别","张""三",'=备注`)).toBe(true)
  })
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-history.test.ts` → 新用例失败，其他用例通过。

### Step 2: 使用 escapeCsvCell

修改 `lottery-history.ts`：

1. 在 `import type { DrawLogEntry } from './lottery-types'` 之前加 `import { escapeCsvCell } from './config-store'`。
2. 把拼接行改成：

```ts
      rows.push([formatDateTime(e.at), label, e.prizeName, name, e.note ?? ''].map(escapeCsvCell).join(','))
```

时间和操作类型由程序生成，`escapeCsvCell` 不会改变它们。

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-history.test.ts` → 全部通过。

### Step 3: 加端到端回归

在 `e2e/lottery.spec.ts` 的 `test.describe('中奖名单 CSV 导出', ...)` 里加一个用例：

```ts
  test('抽奖流水导出同样转义公式前缀和逗号', async ({ page }) => {
    const evilName = '=坑,组长'
    await page.goto('/')
    await page.evaluate((name) => {
      localStorage.removeItem('___lottery___')
      localStorage.setItem('___lottery_countdown___', 'off')
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1,
        headerTitle: '测试抽奖',
        prizes: [{ name: '一等奖', count: 3, everyTimeGet: 3 }],
        roster: [name, '张三', '李四'],
      }))
    }, evilName)
    await page.reload()
    await page.waitForTimeout(3500)
    await drawOneRound(page)
    await closeBanner(page)

    await page.locator('.history-btn').click()
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.lottery-history .export-btn').click(),
    ])
    const content = readFileSync(await download.path(), 'utf-8')
    expect(content.startsWith('﻿')).toBe(true)
    expect(content).toContain(',抽奖,一等奖,"\'=坑,组长",')
  })
```

**Verify**：`pnpm e2e e2e/lottery.spec.ts -g "CSV"` → 全部通过。

### Step 4: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `lottery-history.test.ts`：公式前缀、逗号、引号，覆盖奖项、姓名、备注三列。原有 3 个用例保持通过。
- `e2e/lottery.spec.ts`：真实下载文件内容。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -n "escapeCsvCell" src/views/lottery/core/lottery-history.ts` 至少 2 行输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- 引入 `config-store` 后出现循环依赖或模块初始化错误。
- 需要改列结构才能通过现有用例。

## Maintenance notes

- 以后新增任何 CSV 导出，都要让用户内容经过 `escapeCsvCell`。
- 计划 013 如果增加工号或部门列，这两种导出都要同步改。
