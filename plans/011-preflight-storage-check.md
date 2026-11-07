# Plan 011: 现场检查增加“本地存储”一项

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/preflight.ts src/views/lottery/core/preflight.test.ts src/views/lottery/components/LotteryPreflight.tsx e2e/rehearsal.spec.ts README.md`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

README 把“清理站点数据”“存储写入失败”列为现场持久化的主要风险，但「现场检查」的 4 项（音频、奖品图与头像、离线资源、双屏连接）都不检查存储。现在只有写入真正失败时才会弹提示，那时可能已经在抽奖中途。

加一项“本地存储”检查后，开场前就能看到三件事：能否写入、浏览器是否允许持久保存（不在空间紧张时被自动清理）、进度和配置是否接近上限。需要时还可以一键申请持久保存。

## Current state

`src/views/lottery/core/preflight.ts` 导出纯函数 `checkImages`、`checkOffline`、`checkDualScreen`，以及读取浏览器环境的 `browserOfflineEnvironment`。环境读取和判断分开，判断函数接收普通对象，便于测试。照这个模式写新检查。

`checkDualScreen` 处理彩排的方式（`preflight.ts:102-108`）：

```ts
export function checkDualScreen(supported: boolean, connected: boolean, rehearsal: boolean): PreflightCheck {
  if (rehearsal) return { state: 'attention', detail: '彩排与正式控制台隔离。回到正式舞台连接并检查双屏。' }
```

`src/views/lottery/components/LotteryPreflight.tsx` 里：

- 第 5 行 import 这些函数。
- 第 16–17 行：`const [images, setImages] = useState(pending)`、`const [offline, setOffline] = useState(pending)`。
- 资源检查在一个依赖 `[run]` 的 `useEffect` 里运行，用 `cancelled` 标志防止卸载后更新状态。
- 第 48 行 `const checks = [...]` 列出卡片，标题依次是 `音频`、`奖品图与头像`、`离线资源`、`双屏连接`。
- 第 65 行 `{title === '音频' && <div className="preflight-actions">…` 是卡片内按钮的写法。
- 「重新检查资源」按钮会把状态重置为 `pending` 并递增 `run`。

浏览器 API 事实：

- `navigator.storage`（`persisted()`、`persist()`、`estimate()`）只在安全上下文可用，内网 HTTP 下不存在，必须降级。
- `persist()` 在部分浏览器会弹权限询问，所以只能在用户点击时调用，不能在检查时自动调用。

`e2e/rehearsal.spec.ts:47-64` 的「现场检查显示真实缺图、未确认音频与未连接双屏」按标题定位每张卡片。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/preflight.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/rehearsal.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/preflight.ts`
- `src/views/lottery/core/preflight.test.ts`
- `src/views/lottery/components/LotteryPreflight.tsx`
- `e2e/rehearsal.spec.ts`
- `README.md`（只改「现场离线准备」第 2 步）
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 不要在页面加载时自动调用 `navigator.storage.persist()`。
- 不要改其他 4 项检查的逻辑。
- 不要清理或迁移任何已有数据。

## Git workflow

- 分支：`advisor/011-preflight-storage-check`
- 提交信息用中文并带前缀，例如 `feat: 现场检查增加本地存储检查`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写判断函数的单测

在 `preflight.test.ts` 的 import 里加 `checkStorage`，在 `describe('preflight evidence')` 里加：

```ts
  it('reports storage readiness from write, persistence, quota and size evidence', () => {
    const base = { writable: true, persisted: true, usage: 1_000_000, quota: 100_000_000, localChars: 20_000 }
    expect(checkStorage(base, false).state).toBe('ready')
    expect(checkStorage({ ...base, writable: false }, false).state).toBe('failed')
    expect(checkStorage({ ...base, persisted: false }, false).detail).toContain('申请持久保存')
    expect(checkStorage({ ...base, persisted: null }, false).detail).toContain('无法确认')
    expect(checkStorage({ ...base, usage: 90_000_000 }, false).state).toBe('attention')
    expect(checkStorage({ ...base, localChars: 4_500_000 }, false).detail).toContain('导出')
    expect(checkStorage(base, true).detail).toContain('彩排')
  })
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/preflight.test.ts` → 新用例失败（函数不存在）。

### Step 2: 实现判断函数和环境读取

在 `preflight.ts` 的 `checkDualScreen` 之后加：

```ts
export interface StorageEnvironment {
  writable: boolean
  persisted: boolean | null // null 表示浏览器不支持查询
  usage: number | null
  quota: number | null
  localChars: number // 正式配置和进度在 localStorage 里的字符数
}

// 浏览器的 localStorage 上限常见约 5M 字符（未逐浏览器验证），这里提前提醒。
const LOCAL_CHARS_WARN = 4_000_000

export function checkStorage(env: StorageEnvironment, rehearsal: boolean): PreflightCheck {
  if (rehearsal) return { state: 'attention', detail: '彩排不写入正式进度。回到正式舞台检查本地存储。' }
  if (!env.writable) return { state: 'failed', detail: '本地存储无法写入，刷新后进度无法恢复。请退出隐私模式或检查浏览器存储权限。' }
  const size = `进度与配置约 ${Math.ceil(env.localChars / 1024)} KB`
  if (env.localChars >= LOCAL_CHARS_WARN) return { state: 'attention', detail: `${size}，接近浏览器上限。请先导出配置和中奖名单。` }
  if (env.usage !== null && env.quota && env.usage / env.quota >= 0.8) return { state: 'attention', detail: `站点存储已用 ${Math.round(env.usage / env.quota * 100)}%，接近上限。请先导出配置和中奖名单。` }
  if (env.persisted === true) return { state: 'ready', detail: `已开启持久保存，${size}。` }
  if (env.persisted === false) return { state: 'attention', detail: `浏览器可能在空间紧张时清理站点数据，${size}。可点「申请持久保存」。` }
  return { state: 'attention', detail: `当前环境无法确认持久保存（需 HTTPS 或 localhost），${size}。活动前请导出备份。` }
}

export async function browserStorageEnvironment(): Promise<StorageEnvironment> {
  let writable = false
  try {
    localStorage.setItem('___lottery_probe___', '1')
    localStorage.removeItem('___lottery_probe___')
    writable = true
  } catch { /* 隐私模式或配额已满 */ }
  const localChars = ['___lottery___', '___lottery_config___']
    .reduce((sum, key) => { try { return sum + (localStorage.getItem(key)?.length ?? 0) } catch { return sum } }, 0)
  const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
  const persisted = storage?.persisted ? await storage.persisted().catch(() => null) : null
  const estimate = storage?.estimate ? await storage.estimate().catch(() => null) : null
  return { writable, persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null, localChars }
}

// 只能在用户点击时调用：部分浏览器会弹出权限询问。
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return Boolean(await navigator.storage?.persist?.())
  } catch {
    return false
  }
}
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/preflight.test.ts` → 全部通过；`pnpm type-check` → exit 0。

### Step 3: 接入现场检查面板

修改 `LotteryPreflight.tsx`：

1. 第 5 行的 import 加上 `browserStorageEnvironment, checkStorage, requestPersistentStorage`。
2. 在第 17 行之后加 `const [storage, setStorage] = useState(pending)`。
3. 在资源检查的 `useEffect` 里，`checkOffline(...)` 那行之后加：

```tsx
    void browserStorageEnvironment().then(env => { if (!cancelled) setStorage(checkStorage(env, isRehearsal())) })
```

4. 加一个点击处理函数：

```tsx
  async function handlePersist() {
    setStorage(pending)
    await requestPersistentStorage()
    const env = await browserStorageEnvironment()
    if (alive.current) setStorage(checkStorage(env, isRehearsal()))
  }
```

5. 在 `checks` 数组里、`离线资源` 之后加 `{ title: '本地存储', result: storage },`。
6. 在音频按钮那段之后加：

```tsx
          {title === '本地存储' && storage.state === 'attention' && 'storage' in navigator && !isRehearsal() && <div className="preflight-actions">
            <button type="button" onClick={() => void handlePersist()}>申请持久保存</button>
          </div>}
```

7. 「重新检查资源」按钮的 `onClick` 里，在 `setOffline(pending)` 之后加 `setStorage(pending)`。

**Verify**：`pnpm type-check` → exit 0；`pnpm lint` → exit 0。

### Step 4: 端到端断言

在 `e2e/rehearsal.spec.ts` 的「现场检查显示真实缺图…」用例里，`离线资源` 那条断言之后加：

```ts
  await expect(dialog.locator('.preflight-check').filter({ has: page.getByRole('heading', { name: '本地存储' }) })).toContainText(/持久保存|进度与配置约/)
```

测试地址 `127.0.0.1` 是安全上下文，`navigator.storage` 可用。无头 Chromium 是否已授予持久保存不确定，所以只断言文案里出现关键字。

**Verify**：`pnpm e2e e2e/rehearsal.spec.ts` → 全部通过。

### Step 5: 更新 README

在 `README.md`「现场离线准备」第 2 步末尾追加一句：

```markdown
「本地存储」一项提示未开启持久保存时，点「申请持久保存」，减少浏览器在空间紧张时清理数据的风险。
```

**Verify**：`grep -c "申请持久保存" README.md` → 输出 `1`。

### Step 6: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `preflight.test.ts`：可写、不可写、已持久、未持久、不支持查询、配额接近上限、本地字符接近上限、彩排。
- `e2e/rehearsal.spec.ts`：真实面板出现“本地存储”卡片。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -n "persist?.()" src/views/lottery/core/preflight.ts` 只有 1 行输出，位于 `requestPersistentStorage` 里
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- TypeScript 的 DOM 类型里 `navigator.storage` 被声明为必有，导致 `?.` 写法报错：改成 `'storage' in navigator` 判断即可；如果仍报错，报告。
- 现有的 4 项检查断言失败。

## Maintenance notes

- `LOCAL_CHARS_WARN` 是保守的提示阈值，不是精确上限。不同浏览器的配额不同，现场以实际写入为准。
- 3000 人、几百轮的场次，抽奖流水里每轮都保存完整奖池 ID，存档会明显变大。这项检查能提前发现。如果以后真有这种规模的活动，再考虑压缩 `poolIds` 的存储方式。
- 计划 012 实现进度恢复后，可以在这张卡片里加上“已导出备份”的提示。
