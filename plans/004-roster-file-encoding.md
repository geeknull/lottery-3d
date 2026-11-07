# Plan 004: 导入 GBK 编码的名单文件时不再出现乱码

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/config-store.ts src/views/lottery/core/config-store.test.ts src/views/lottery/components/LotteryConfigPanel.tsx e2e/reliability.spec.ts`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

配置面板支持从 `.txt` / `.csv` 导入名单，但只按 UTF-8 解码。GBK 字节解码后全是 `�`，已实测：`张三`、`李四` 的 GBK 字节用 UTF-8 解码得到 `["����","����"]`，用 `gb18030` 解码能得到正确结果。

中文 Windows 上 Excel 的“CSV（逗号分隔）”通常保存为 GBK（这一点来自经验，没有在真实 Excel 上验证）。这种情况下名单人数看起来是对的，名字却全坏了，而且没有任何提示，容易带到现场。修完后 UTF-8、GBK 和带 BOM 的 UTF-16 都能正确导入，解不出来的文件会给出提示。

## Current state

- `src/views/lottery/components/LotteryConfigPanel.tsx:146-156`，导入入口：

```ts
  async function handleRosterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const entries = parseRosterEntries(await file.text())
    if (entries.length === 0) {
      toast('文件里没有解析出任何名字')
      return
    }
    setRosterText(rosterEntriesToText(entries))
  }
```

- `LotteryConfigPanel.tsx:334` 的提示文案：

```tsx
          可直接从 Excel 整列复制后粘贴（第二列不是链接时只取名字）。文件导入支持 .txt / .csv，规则相同。
```

- `src/views/lottery/core/config-store.ts` 放配置解析相关的纯函数，`parseRosterEntries` 在这里，测试在 `config-store.test.ts`。
- `handleConfigFile` 也用 `file.text()`，但它读的是本程序导出的 UTF-8 JSON，不需要改。
- 已实测 `new TextDecoder('gb18030')` 在 vitest 环境可用，`new TextDecoder('utf-8', { fatal: true })` 遇到 GBK 字节会抛错。
- `config-store.ts` 用分号，保持原有风格。注释用中文。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/config-store.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/reliability.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/config-store.ts`
- `src/views/lottery/core/config-store.test.ts`
- `src/views/lottery/components/LotteryConfigPanel.tsx`
- `e2e/reliability.spec.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `handleConfigFile`（配置 JSON 导入）。
- `parseRosterEntries` 的分列规则。
- 不要引入编码检测的第三方依赖。

## Git workflow

- 分支：`advisor/004-roster-file-encoding`
- 提交信息用中文并带前缀，例如 `fix: 名单文件导入支持 GBK 和 UTF-16`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

在 `config-store.test.ts` 的 import 里加 `decodeTextFile`，并在文件末尾加：

```ts
describe('decodeTextFile', () => {
  const bytes = (...values: number[]) => new Uint8Array(values).buffer

  it('解码 UTF-8', () => {
    expect(decodeTextFile(new TextEncoder().encode('张三\n李四').buffer as ArrayBuffer)).toBe('张三\n李四')
  })

  it('去掉 UTF-8 BOM', () => {
    expect(decodeTextFile(bytes(0xef, 0xbb, 0xbf, 0xe5, 0xbc, 0xa0))).toBe('张')
  })

  it('UTF-8 解码失败时按 GBK 解码', () => {
    expect(decodeTextFile(bytes(0xd5, 0xc5, 0xc8, 0xfd, 0x0a, 0xc0, 0xee, 0xcb, 0xc4))).toBe('张三\n李四')
  })

  it('按 BOM 解码 UTF-16', () => {
    expect(decodeTextFile(bytes(0xff, 0xfe, 0x20, 0x5f))).toBe('张')
    expect(decodeTextFile(bytes(0xfe, 0xff, 0x5f, 0x20))).toBe('张')
  })

  it('空文件返回空字符串', () => {
    expect(decodeTextFile(bytes())).toBe('')
  })
})
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/config-store.test.ts` → 新用例失败（`decodeTextFile` 不存在），其他用例不受影响。

### Step 2: 实现解码函数

在 `config-store.ts` 的 `parseRosterEntries` 之前加：

```ts
// 解码导入的文本文件。Excel 按系统编码保存 CSV，不能假定是 UTF-8：
// 先看 BOM，再严格按 UTF-8 解码，失败时按 GB18030（GBK 的超集）解码。
export function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/config-store.test.ts` → 全部通过。

### Step 3: 接入配置面板

修改 `LotteryConfigPanel.tsx`：

1. 从 `../core/config-store` 的 import 里加 `decodeTextFile`。
2. 把 `handleRosterFile` 改成：

```ts
  async function handleRosterFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = decodeTextFile(await file.arrayBuffer())
    const entries = parseRosterEntries(text)
    if (entries.length === 0) {
      toast('文件里没有解析出任何名字')
      return
    }
    setRosterText(rosterEntriesToText(entries))
    if (text.includes('�')) toast('部分字符无法识别，请检查名单，或把文件另存为 UTF-8 后重新导入', 8000)
  }
```

3. 把提示文案改成：

```tsx
          可直接从 Excel 整列复制后粘贴（第二列不是链接时只取名字）。文件导入支持 .txt / .csv（UTF-8 或 GBK 编码），规则相同。
```

**Verify**：`pnpm type-check` → exit 0。

### Step 4: 加端到端回归

在 `e2e/reliability.spec.ts` 末尾加：

```ts
test('导入 GBK 编码的名单文件后姓名正确', async ({ page }) => {
  await gotoFresh(page)
  await page.locator('.config-btn').click()
  await page.locator('.lottery-config-panel input[accept=".txt,.csv"]').setInputFiles({
    name: 'roster.csv',
    mimeType: 'text/csv',
    // GBK 编码的「张三\n李四」
    buffer: Buffer.from([0xd5, 0xc5, 0xc8, 0xfd, 0x0a, 0xc0, 0xee, 0xcb, 0xc4]),
  })
  await expect(page.locator('.lottery-config-panel textarea')).toHaveValue('张三\n李四')
})
```

**Verify**：`pnpm e2e e2e/reliability.spec.ts` → 全部通过，包含这项新用例。

### Step 5: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `config-store.test.ts`：UTF-8、UTF-8 BOM、GBK、UTF-16 LE/BE、空文件。
- `e2e/reliability.spec.ts`：真实文件选择流程。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，`decodeTextFile` 的用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -n "parseRosterEntries(await file.text())" src/views/lottery/components/LotteryConfigPanel.tsx` 没有输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- 浏览器里 `new TextDecoder('gb18030')` 抛错：报告浏览器版本，不要引入依赖。
- UTF-8 用例因为 BOM 或 `ArrayBuffer` 类型问题反复失败两次。

## Maintenance notes

- 纯 ASCII 文件既是合法 UTF-8 也是合法 GBK，结果相同，不需要特殊处理。
- 少数 GBK 字节序列恰好也是合法 UTF-8，这种文件会按 UTF-8 解出错字，但概率很低，这是不做统计检测的取舍。
- Big5、Shift-JIS 等编码不支持，这类文件会走 `�` 提示，或解出错字。
- 新增其他文本导入入口时，复用 `decodeTextFile`。
