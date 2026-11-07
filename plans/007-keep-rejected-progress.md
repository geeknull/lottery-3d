# Plan 007: 无法恢复的旧进度先备份并提醒，不再静默丢弃

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-config.ts src/views/lottery/core/lottery-config.test.ts src/views/lottery/core/config-store.ts src/views/lottery/components/Lottery.tsx src/views/lottery/components/LotteryConfigPanel.tsx e2e/reliability.spec.ts`
> 计划 003、004、005 也改这些文件中的一部分。如果有改动，逐一对照“现状”里的摘录；摘录对得上就继续，对不上按 STOP 条件处理。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none（和 003、005 改同一个文件，不要并行执行）
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

启动时如果存档无法恢复（JSON 损坏、配置指纹不符、结构校验失败），程序直接当作新场次，换一个新种子，不给任何提示。下一次抽奖或生成承诺时，旧进度被整份覆盖，再也找不回来。

正常流程里改配置会先清掉进度，所以这种情况不常见，但一旦出现（比如以后的版本收紧校验、存档被部分写坏），丢的就是整场正式结果。修完后，被拒绝的原文会先备份，主持人会看到提示，并能从配置面板导出备份。

## Current state

`src/views/lottery/core/lottery-config.ts:138-161`，三处直接 `return`：

```ts
  getLocalStorage() {
    if (rehearsal) return;
    if (isInit !== false) {
      return void 0;
    }
    isInit = true;
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) {
      return void 0;
    }
    let saved: unknown;
    try {
      saved = JSON.parse(raw);
    } catch {
      return void 0;
    }
    // 配置变过（或老版本存档没有指纹）就不恢复，避免名单/奖项对不上
    if (!saved || typeof saved !== 'object' || !('hash' in saved) || saved.hash !== currentHash) {
      return void 0;
    }
    // 校验版本、进度结构及所有引用，通过后才更新内存，避免半恢复状态。
    if (!isSavedRestorable(saved, cardList, lotteryConfig.prizeList)) {
      return void 0;
    }
```

`lottery-config.ts:191-194`，重置进度只删主键，本计划的备份键不受影响：

```ts
  clearLocalStorage() {
    if (rehearsal) return;
    localStorage.removeItem(localStorageKey)
  },
```

`src/views/lottery/components/Lottery.tsx:45-50`，已有的存储失败提示，新提示照这个写法：

```tsx
  // 抽奖进度写入失败（配额超限/隐私模式）时提醒主持人及时导出中奖名单
  useEffect(() => {
    const onStorageError = () => toast('⚠ 抽奖进度保存失败，本地存储可能已满，请尽快到配置面板导出中奖名单', 8000)
    bus.on('storage-error', onStorageError)
    return () => bus.off('storage-error', onStorageError)
  }, [])
```

`src/views/lottery/core/config-store.ts:152-164`，已有的私有下载函数：

```ts
function downloadFile(filename: string, content: string, mime: string): void {
```

`LotteryConfigPanel.tsx` 底部按钮区 `.panel-actions` 里有「导出中奖名单 CSV」「重置抽奖进度」等按钮。

注意：

- 模块加载时 React 还没挂载，不能靠 bus 事件提醒，事件会丢失。要用“领取一次”的函数，由 `Lottery.tsx` 挂载后主动查询。开发模式下 StrictMode 会让 effect 执行两次，“领取一次”能避免出现两条提示。
- 备份会让 localStorage 占用翻倍。写入备份失败时不能让启动崩溃。
- 彩排在 `getLocalStorage()` 第一行就返回，不会产生备份。
- 不要改动 `setLocalStorage()`，计划 003 会改它。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/reliability.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/lottery-config.ts`（只改 `getLocalStorage()`、接口和新增的模块级函数）
- `src/views/lottery/core/lottery-config.test.ts`
- `src/views/lottery/core/config-store.ts`（新增一个导出函数）
- `src/views/lottery/components/Lottery.tsx`
- `src/views/lottery/components/LotteryConfigPanel.tsx`
- `e2e/reliability.spec.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `setLocalStorage()`、`clearLocalStorage()`。
- `src/views/lottery/core/config-restore.ts`：校验规则不变。
- 不要尝试自动修复或部分恢复被拒绝的存档。

## Git workflow

- 分支：`advisor/007-keep-rejected-progress`
- 提交信息用中文并带前缀，例如 `fix: 无法恢复的旧进度先备份并提醒`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

在 `lottery-config.test.ts` 末尾加（`lotteryConfig`、`loadFresh` 是文件顶部已有的）：

```ts
describe('无法恢复的旧进度', () => {
  async function savedProgress() {
    const { getRandomCard } = await import('./lottery-algorithm')
    getRandomCard(lotteryConfig.prizeList[0])
    return JSON.parse(localStorage.getItem('___lottery___')!)
  }

  async function reloadWith(raw: string) {
    localStorage.setItem('___lottery___', raw)
    vi.resetModules()
    return (await import('./lottery-config')).default
  }

  it('配置指纹不符时备份原文，并且只提醒一次', async () => {
    const raw = JSON.stringify({ ...(await savedProgress()), hash: 'changed' })
    const reloaded = await reloadWith(raw)
    expect(JSON.parse(reloaded.getRejectedProgress()!)).toMatchObject({ reason: 'config-mismatch', raw })
    expect(reloaded.takeRejectedNotice()).toBe(true)
    expect(reloaded.takeRejectedNotice()).toBe(false)
    expect(reloaded.drawLog).toEqual([])
  })

  it('存档结构损坏时备份原因是 invalid-progress', async () => {
    const reloaded = await reloadWith(JSON.stringify({ ...(await savedProgress()), version: 99 }))
    expect(JSON.parse(reloaded.getRejectedProgress()!).reason).toBe('invalid-progress')
  })

  it('JSON 无法解析时备份原因是 invalid-json', async () => {
    const reloaded = await reloadWith('{broken')
    expect(JSON.parse(reloaded.getRejectedProgress()!)).toMatchObject({ reason: 'invalid-json', raw: '{broken' })
  })

  it('正常恢复时不产生备份，也不提醒', async () => {
    await savedProgress()
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.getRejectedProgress()).toBeNull()
    expect(reloaded.takeRejectedNotice()).toBe(false)
  })

  it('备份写入失败时启动不受影响，仍会提醒', async () => {
    const raw = JSON.stringify({ ...(await savedProgress()), hash: 'changed' })
    localStorage.setItem('___lottery___', raw)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === '___lottery_rejected___') throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.takeRejectedNotice()).toBe(true)
    expect(reloaded.getRejectedProgress()).toBeNull()
  })
})
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` → 新用例失败（函数不存在），原有用例通过。

### Step 2: 在 lottery-config.ts 里实现备份

1. 在 `LotteryConfig` 接口里加：

```ts
  getRejectedProgress(): string | null; // 最近一次无法恢复的旧进度备份（JSON 文本），没有时为 null
  takeRejectedNotice(): boolean; // 本次启动有旧进度被拒绝时返回 true，只返回一次
```

2. 在 `const localStorageKey = '___lottery___';` 之后加：

```ts
const rejectedKey = '___lottery_rejected___';
let rejectedNoticePending = false;

// 旧进度校验不通过时先留底再开新场次，否则下一次保存会把它永久覆盖。
// 只保留最近一份；备份写入失败（多为配额不足）不能影响启动。
function keepRejectedProgress(raw: string, reason: 'invalid-json' | 'config-mismatch' | 'invalid-progress') {
  rejectedNoticePending = true;
  try {
    localStorage.setItem(rejectedKey, JSON.stringify({ at: Date.now(), reason, raw }));
  } catch (e) {
    console.warn('无法恢复的旧进度备份失败（可能超出本地存储配额）', e);
  }
}
```

3. 在 `lotteryConfig` 对象里加：

```ts
  getRejectedProgress() {
    try {
      return localStorage.getItem(rejectedKey);
    } catch {
      return null;
    }
  },
  takeRejectedNotice() {
    const pending = rejectedNoticePending;
    rejectedNoticePending = false;
    return pending;
  },
```

4. 修改 `getLocalStorage()` 的三处返回：

```ts
    try {
      saved = JSON.parse(raw);
    } catch {
      keepRejectedProgress(raw, 'invalid-json');
      return void 0;
    }
    // 配置变过（或老版本存档没有指纹）就不恢复，避免名单/奖项对不上
    if (!saved || typeof saved !== 'object' || !('hash' in saved) || saved.hash !== currentHash) {
      keepRejectedProgress(raw, 'config-mismatch');
      return void 0;
    }
    // 校验版本、进度结构及所有引用，通过后才更新内存，避免半恢复状态。
    if (!isSavedRestorable(saved, cardList, lotteryConfig.prizeList)) {
      keepRejectedProgress(raw, 'invalid-progress');
      return void 0;
    }
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` → 全部通过，含 5 个新用例。

### Step 3: 加导出函数

在 `config-store.ts` 的 `exportConfigFile` 之后加：

```ts
// 导出无法恢复的旧进度备份，交给技术人员排查或手工找回结果。
export function exportRejectedProgress(backup: string): void {
  downloadFile('未恢复的抽奖进度.json', backup, 'application/json');
}
```

**Verify**：`pnpm type-check` → exit 0。

### Step 4: 接入界面

在 `Lottery.tsx` 已有的 storage-error effect 之后加：

```tsx
  // 启动时发现无法恢复的旧进度：提醒主持人，备份可在配置面板导出
  useEffect(() => {
    if (!lotteryConfig.takeRejectedNotice()) return
    toast(lotteryConfig.getRejectedProgress()
      ? '⚠ 发现无法恢复的旧抽奖进度，本场从头开始。旧进度已备份，可在配置面板导出'
      : '⚠ 发现无法恢复的旧抽奖进度，本场从头开始，备份失败（本地存储可能已满）', 10000)
  }, [])
```

`FeedbackHost` 是 `Lottery` 的子组件，子组件的 effect 先执行，所以这里调用 `toast` 时提示层已经就绪。

在 `LotteryConfigPanel.tsx` 里：

1. 从 `../core/config-store` 的 import 里加 `exportRejectedProgress`。
2. 在组件里 `const applyConfig = ...` 之后加 `const rejectedProgress = lotteryConfig.getRejectedProgress()`。
3. 在 `.panel-actions` 的「导出中奖名单 CSV」按钮之后加：

```tsx
        {rejectedProgress && <button onClick={() => exportRejectedProgress(rejectedProgress)}>导出未恢复的旧进度</button>}
```

**Verify**：`pnpm type-check` → exit 0；`pnpm lint` → exit 0。

### Step 5: 加端到端回归

在 `e2e/reliability.spec.ts` 顶部加 `import { readFileSync } from 'node:fs'`，并在末尾加：

```ts
test('无法恢复的旧进度会备份并提示，可从配置面板导出', async ({ page }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)
  const tampered = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    saved.hash = 'changed'
    const raw = JSON.stringify(saved)
    localStorage.setItem('___lottery___', raw)
    return raw
  })
  await page.reload()
  await expect(page.getByText(/发现无法恢复的旧抽奖进度/)).toBeVisible()
  await expect(page.locator('.prize-item-count-text').last()).toHaveText('已抽 0/20')

  await page.locator('.config-btn').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出未恢复的旧进度' }).click(),
  ])
  const backup = JSON.parse(readFileSync(await download.path(), 'utf-8'))
  expect(backup.reason).toBe('config-mismatch')
  expect(backup.raw).toBe(tampered)
})
```

**Verify**：`pnpm e2e e2e/reliability.spec.ts` → 全部通过，包含这项新用例。

### Step 6: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `lottery-config.test.ts`：三种拒绝原因、只提醒一次、正常恢复无备份、备份写入失败。原有的「损坏存档不会让启动崩溃」用例必须继续通过。
- `e2e/reliability.spec.ts`：提示、重新开始、导出内容。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -c "keepRejectedProgress(raw" src/views/lottery/core/lottery-config.ts` 输出 `3`
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的 `getLocalStorage()` 摘录和实际代码对不上。
- 现有 E2E 因为新提示遮挡元素而失败：报告用例名，不要缩短提示时间来绕过。
- 需要修改 `setLocalStorage()` 或 `config-restore.ts` 才能通过。

## Maintenance notes

- 备份只保留最近一份。连续出现两次拒绝时，更早的备份会被覆盖。
- 备份没有自动清理，会一直占用空间，直到下次拒绝覆盖它或站点数据被清除。如果以后要加“删除备份”按钮，放在导出按钮旁边。
- 计划 012（进度恢复）可以把这份备份作为恢复来源之一。
- 以后收紧 `isSavedRestorable` 的校验时，旧存档会走到这里，记得在发布说明里提醒。
