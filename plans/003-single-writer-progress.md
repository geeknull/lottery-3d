# Plan 003: 多个正式窗口不再互相覆盖抽奖进度

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-config.ts src/views/lottery/core/lottery-config.test.ts src/views/lottery/core/lottery-algorithm.ts src/views/lottery/core/lottery-algorithm.test.ts src/views/lottery/core/lottery-controller.ts src/views/lottery/core/lottery-controller.test.ts src/views/lottery/core/event-bus.ts src/views/lottery/components/Lottery.tsx README.md`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none（和 007 改同一个文件，不要并行执行）
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

同一浏览器里可能同时开着多个正式抽奖窗口：复制的标签页、已安装的 PWA 窗口加普通标签页，都共用一份 localStorage。每个窗口把进度放在内存里，保存时整份覆盖，互相之间没有任何感知。

这已用两个无头浏览器页面复现：窗口 A 抽完第 1 轮后打开窗口 B，A 再抽第 2 轮，然后 B 抽奖。B 用旧的随机状态抽出了和 A 第 2 轮**完全相同的 10 人**，存档仍然只有 2 轮。如果两个窗口抽的是不同奖项，后保存的窗口会把先抽那一轮的记录抹掉。这是正式结果被静默改写，修完后，过期的窗口不能再写入，并会提示刷新。

## Current state

相关文件：

- `src/views/lottery/core/lottery-config.ts`：进度单例和全部 localStorage 读写。
- `src/views/lottery/core/lottery-controller.ts`：`start()`、`stop()`。
- `src/views/lottery/core/lottery-algorithm.ts`：`voidWinner()`、`undoLastDraw()`。
- `src/views/lottery/core/event-bus.ts`：mitt 事件类型。
- `src/views/lottery/components/Lottery.tsx`：主界面，挂载全局提示组件。

`lottery-config.ts:78-80` 的模块状态：

```ts
let isInit = false;
let storageHealthy = true; // localStorage 写入是否正常（失败只提醒一次的去重标志）
const localStorageKey = '___lottery___';
```

`lottery-config.ts:104-128`，保存时直接整份覆盖：

```ts
  setLocalStorage() {
    if (rehearsal) return;
    // 写入是抽奖热路径（每轮 getRandomCard 都调）。配额超限/隐私模式下 setItem 会抛
    // QuotaExceededError，不能让它冒泡打断 lotteryStop 的揭晓动画/彩带，更不能静默丢结果——
    // 捕获后发事件提示主持人及时导出。从健康转失败只提醒一次，避免每轮刷屏。
    try {
      localStorage.setItem(localStorageKey, JSON.stringify({
        version: 2,
        hash: currentHash,
        currentPrize: lotteryConfig.currentPrize,
```

`lottery-config.ts:191-198`：

```ts
  clearLocalStorage() {
    if (rehearsal) return;
    localStorage.removeItem(localStorageKey)
  },
};

// 启动时恢复抽奖进度（原版此调用缺失导致进度只写不读）
lotteryConfig.getLocalStorage();
```

全仓库 `src/` 里没有 `addEventListener('storage'`。

`lottery-controller.ts` 的 `start()` 开头：

```ts
async function start(): Promise<boolean> {
  stopShowcase()
  if (!STATUS.isWait()) return false
  const prize = lotteryConfig.getCurrentPrize()
```

`stop()` 开头：

```ts
async function stop(): Promise<boolean> {
  if (!isSpinning()) return false
  // 同步加锁并固定结果。任何来源的第二个 stop 都在这里被挡住。
  STATUS.setPhase('revealing')
  stopSpinTicks()
  const version = flowVersion
  const prize = lotteryConfig.getCurrentPrize()
  if (!prize || !prize.countRemain || !lotteryConfig.cardListRemainAll.length) {
    try { await rotateBallStop() } catch { /* 恢复可操作状态 */ }
    if (version !== flowVersion) return false
    STATUS.setPhase('idle')
    toast('奖项或奖池不可用，请重新选择')
    return false
  }
```

设计约束（都已核实）：

- **不能依赖 `navigator.locks`**：它只在安全上下文可用，而这个工具也可能部署在内网 HTTP。`storage` 事件和 localStorage 在非安全上下文都可用。
- **彩排和控制窗不受影响**：`?mode=rehearsal` 从不写正式进度；`?mode=control` 的窗口也加载这个模块，但只读不写，且不渲染主界面。
- **`e2e/sync-isolation.spec.ts` 里有两个正式展示页**。它只断言两边的控制窗配对互相独立，以及另一页没有中奖结果。本计划不改变这些事实，这个测试应继续通过。
- **旧存档没有 `revision` 字段**，要按 0 处理。`isSavedRestorable` 忽略未知字段，所以旧版本代码读新存档也没问题。
- **存档被拒绝恢复时**（配置指纹不符或校验失败），本窗口是新场次，但 localStorage 里仍是旧数据。`knownRevision` 必须等于存储里的值，否则这个窗口会被判过期，再也写不进去。所以要在 `getLocalStorage()` 之后无条件读取一次，不要写在恢复成功的分支里。

## 设计

用一个单调递增的 `revision` 做乐观并发控制：

1. 存档增加 `revision` 字段。每次成功保存后，本窗口的 `knownRevision` 加 1。
2. 写入前比较存储里的 `revision` 和 `knownRevision`。不相等说明别的窗口写过或清空过，本窗口标记为过期，放弃写入。
3. 监听 `storage` 事件，别的窗口一写入就立即标记过期，并弹出阻塞提示。
4. `start()`、`stop()`、`voidWinner()`、`undoLastDraw()` 开始前检查过期状态，不让过期窗口改动内存结果。

这是“最后写入者被拒绝”，不是锁。两个窗口可以同时打开，只有落后的那个不能继续写。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过（基线 42 文件 416 项） |
| 单文件 E2E | `pnpm e2e e2e/multi-window.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/lottery-config.ts`
- `src/views/lottery/core/lottery-config.test.ts`
- `src/views/lottery/core/lottery-algorithm.ts`
- `src/views/lottery/core/lottery-algorithm.test.ts`
- `src/views/lottery/core/lottery-controller.ts`
- `src/views/lottery/core/lottery-controller.test.ts`
- `src/views/lottery/core/event-bus.ts`
- `src/views/lottery/components/Lottery.tsx`
- `src/views/lottery/components/LotteryStaleNotice.tsx`（新建）
- `src/views/lottery/components/lottery-stale-notice.scss`（新建）
- `e2e/multi-window.spec.ts`（新建）
- `README.md`（只加一条说明）
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `src/views/lottery/core/config-restore.ts`：不要校验 `revision`，未知字段本来就被忽略。
- `src/views/lottery/core/lottery-sync.ts`：双屏配对逻辑不变。
- `getLocalStorage()` 函数体：不要改动，计划 007 会改这里。
- 不要引入 `navigator.locks` 或新依赖。
- 不要把存档 `version` 改成 3，`e2e/storage.spec.ts` 断言它是 2。

## Git workflow

- 分支：`advisor/003-single-writer-progress`
- 提交信息用中文并带前缀，例如 `fix: 阻止过期窗口覆盖正式抽奖进度`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 给事件总线加类型

在 `event-bus.ts` 的 mitt 类型里加一行：

```ts
  'progress-stale': undefined // 其他窗口写入了更新的正式进度，本窗口已停止保存
```

**Verify**：`pnpm type-check` → exit 0。

### Step 2: 给 lottery-config.ts 加版本比较

1. 在 `LotteryConfig` 接口里加：

```ts
  isProgressStale(): boolean; // 其他窗口已写入更新的进度时返回 true，本窗口不能再改结果
```

2. 在 `const localStorageKey = '___lottery___';` 之后加：

```ts
let knownRevision = 0; // 本窗口最后读到或写入的存档版本
let progressStale = false;

// 读取存档版本。没有存档、解析失败或旧存档都按 0 处理。
function readStoredRevision(): number {
  try {
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('revision' in parsed)) return 0;
    return Number.isSafeInteger(parsed.revision) ? parsed.revision as number : 0;
  } catch {
    return 0;
  }
}

// 比较存储和本窗口的版本。不一致说明别的窗口写入或清空过，本窗口就此失效。
function checkProgressStale(): boolean {
  if (rehearsal) return false;
  if (!progressStale && readStoredRevision() !== knownRevision) {
    progressStale = true;
    bus.emit('progress-stale');
  }
  return progressStale;
}
```

3. 在 `lotteryConfig` 对象里加 `isProgressStale: checkProgressStale,`。

4. 修改 `setLocalStorage()`：

```ts
  setLocalStorage() {
    if (rehearsal) return;
    if (checkProgressStale()) return; // 不用本窗口的旧内存覆盖别的窗口写入的新进度
    const revision = knownRevision + 1;
    // （保留原有注释）
    try {
      localStorage.setItem(localStorageKey, JSON.stringify({
        version: 2,
        revision,
        hash: currentHash,
        // …其余字段保持不变
      }));
      knownRevision = revision;
      storageHealthy = true;
    } catch (e) {
      // 保持不变
    }
  },
```

写入失败时 `knownRevision` 不变，和存储一致。

5. 修改 `clearLocalStorage()`，在 `removeItem` 之后加 `knownRevision = 0;`。

6. 修改文件末尾：

```ts
// 启动时恢复抽奖进度（原版此调用缺失导致进度只写不读）
lotteryConfig.getLocalStorage();
// 恢复被拒绝时存储里仍是旧数据，这里无条件同步，否则新场次会被误判为过期。
knownRevision = readStoredRevision();

// 其他窗口写入或清空正式进度时，本窗口立即失效。storage 事件不会发给写入者自己。
if (!rehearsal) {
  window.addEventListener('storage', event => {
    if (event.key === localStorageKey || event.key === null) checkProgressStale();
  });
}
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` → 原有用例全部通过。

### Step 3: 写存档版本的单测

在 `lottery-config.test.ts` 末尾加一个 `describe('多窗口写入保护', ...)`，沿用文件顶部的 `lotteryConfig`、`bus` 和 `loadFresh`：

```ts
describe('多窗口写入保护', () => {
  // 模拟另一个窗口写入了更新的进度
  function writeFromOtherWindow() {
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, revision: saved.revision + 1, marker: 'other-window' }))
  }

  it('每次保存递增版本', () => {
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(2)
  })

  it('其他窗口写入后不覆盖，并只提醒一次', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    writeFromOtherWindow()
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).marker).toBe('other-window')
    expect(lotteryConfig.isProgressStale()).toBe(true)
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('收到 storage 事件时立即失效', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    writeFromOtherWindow()
    window.dispatchEvent(new StorageEvent('storage', { key: '___lottery___' }))
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('其他窗口清空进度后本窗口失效', () => {
    lotteryConfig.setLocalStorage()
    localStorage.removeItem('___lottery___')
    expect(lotteryConfig.isProgressStale()).toBe(true)
  })

  it('无关键名的 storage 事件不会让本窗口失效', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    window.dispatchEvent(new StorageEvent('storage', { key: '___lottery_sound___' }))
    expect(onStale).not.toHaveBeenCalled()
  })

  it('存档被拒绝恢复时，新场次仍能保存', async () => {
    lotteryConfig.setLocalStorage()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, hash: 'changed', revision: 9 }))
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.isProgressStale()).toBe(false)
    reloaded.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(10)
  })

  it('没有 revision 的旧存档按 0 处理', async () => {
    lotteryConfig.setLocalStorage()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    delete saved.revision
    localStorage.setItem('___lottery___', JSON.stringify(saved))
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    reloaded.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(1)
  })
})
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts` → 全部通过，含 7 个新用例。

### Step 4: 阻止过期窗口改动结果

在 `lottery-algorithm.ts` 里：

- `voidWinner` 第一行加 `if (lotteryConfig.isProgressStale()) return false;`
- `undoLastDraw` 第一行加 `if (lotteryConfig.isProgressStale()) return null;`

在 `lottery-controller.ts` 里：

- `start()` 在 `if (!STATUS.isWait()) return false` 之后加：

```ts
  if (lotteryConfig.isProgressStale()) { toast('此窗口的进度已过期，请刷新后再抽奖'); return false }
```

- `stop()` 把条件和提示改成：

```ts
  const stale = lotteryConfig.isProgressStale()
  if (stale || !prize || !prize.countRemain || !lotteryConfig.cardListRemainAll.length) {
    try { await rotateBallStop() } catch { /* 恢复可操作状态 */ }
    if (version !== flowVersion) return false
    STATUS.setPhase('idle')
    toast(stale ? '此窗口的进度已过期，本轮没有抽取，请刷新' : '奖项或奖池不可用，请重新选择')
    return false
  }
```

在 `lottery-controller.test.ts` 的 `describe('统一抽奖指令')` 里加（`stage`、`config`、`status`、`controller` 是文件里已有的变量）：

```ts
  it('进度过期的窗口不能开始抽奖', async () => {
    config.setLocalStorage()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, revision: saved.revision + 1 }))
    expect(await controller.lotteryStart()).toBe(false)
    expect(status.getPhase()).toBe('idle')
    expect(stage.rotateBall).not.toHaveBeenCalled()
  })

  it('旋转中进度过期时不抽取，也不写入流水', async () => {
    config.setLocalStorage()
    await controller.lotteryStart()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, revision: saved.revision + 1 }))
    expect(await controller.lotteryStop()).toBe(false)
    expect(config.drawLog).toHaveLength(0)
    expect(status.getPhase()).toBe('idle')
  })
```

在 `lottery-algorithm.test.ts` 里加两个用例，确认过期窗口的 `voidWinner` 返回 `false`、`undoLastDraw` 返回 `null`，而且内存里的中奖名单没有变化。先读这个文件顶部的 `loadFresh` 写法，照它获取 `lotteryConfig` 和函数。

**Verify**：`pnpm test` → 全部通过。

### Step 5: 新增阻塞提示组件

新建 `src/views/lottery/components/LotteryStaleNotice.tsx`：

```tsx
import { useEffect, useState } from 'react'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'
import './lottery-stale-notice.scss'

// 另一个窗口更新了正式进度后，此窗口继续操作会造成重复抽取，只能刷新。
export default function LotteryStaleNotice() {
  const [stale, setStale] = useState(false)

  useEffect(() => {
    const onStale = () => setStale(true)
    bus.on('progress-stale', onStale)
    // 事件可能在组件挂载前发出
    setStale(lotteryConfig.isProgressStale())
    return () => bus.off('progress-stale', onStale)
  }, [])

  if (!stale) return null

  return (
    <div className="lottery-stale-notice" role="dialog" aria-modal="true" aria-labelledby="stale-notice-title">
      <div className="stale-card">
        <h3 id="stale-notice-title">此窗口的进度已过期</h3>
        <p>另一个窗口更新了正式抽奖进度。为避免覆盖结果，此窗口已停止保存。请关闭多余的窗口，或刷新此窗口载入最新进度。</p>
        <button type="button" onClick={() => window.location.reload()}>刷新并载入最新进度</button>
      </div>
    </div>
  )
}
```

`useLotteryShortcuts` 在存在 `[role="dialog"]` 时会屏蔽全局快捷键，所以这个 `role` 不能省。

新建 `lottery-stale-notice.scss`，结构和配色照抄 `lottery-compat-notice.scss` 的 `.lottery-compat-notice`、`.compat-card`、`.compat-dismiss`，只把类名换掉，`z-index` 用 `1300`（高于兼容提示的 1200，低于反馈层的 2000）。

在 `Lottery.tsx` 里 import 组件，并在 `<LotteryCompatNotice />` 之后加：

```tsx
      {!rehearsal && <LotteryStaleNotice />}
```

**Verify**：`pnpm type-check` → exit 0；`pnpm lint` → exit 0。

### Step 6: 写端到端测试

新建 `e2e/multi-window.spec.ts`：

```ts
import { test, expect, type Page } from '@playwright/test'
import { gotoFresh, drawOneRound, closeBanner } from './helpers'

const savedDraws = (page: Page) => page.evaluate(() =>
  (JSON.parse(localStorage.getItem('___lottery___')!) as { drawLog: unknown[] }).drawLog.length)

test('过期窗口被阻止，不会重复抽取或覆盖正式进度', async ({ page, context }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)

  const other = await context.newPage()
  await other.goto('/')
  await expect(other.locator('#primaryCta')).toHaveText('开始抽奖', { timeout: 20000 })

  await page.bringToFront()
  await drawOneRound(page)
  await closeBanner(page)
  expect(await savedDraws(page)).toBe(2)

  await other.bringToFront()
  const notice = other.getByRole('dialog', { name: '此窗口的进度已过期' })
  await expect(notice).toBeVisible()
  await other.keyboard.press(' ')
  await other.waitForTimeout(500)
  expect(await savedDraws(other)).toBe(2)

  await notice.getByRole('button', { name: '刷新并载入最新进度' }).click()
  await expect(other.locator('.prize-item-count-text').last()).toHaveText('已抽 20/20')
  await expect(other.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)
})

test('彩排窗口不受影响，也不会让正式窗口过期', async ({ page, context }) => {
  await gotoFresh(page)
  await drawOneRound(page)
  await closeBanner(page)

  const rehearsal = await context.newPage()
  await rehearsal.goto('/?mode=rehearsal')
  await drawOneRound(rehearsal)
  await expect(rehearsal.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)

  await page.bringToFront()
  await expect(page.getByRole('dialog', { name: '此窗口的进度已过期' })).toHaveCount(0)
})
```

默认奖项“三等奖”共 20 人、每轮 10 人，所以两轮后显示 `已抽 20/20`。

**Verify**：`pnpm e2e e2e/multi-window.spec.ts e2e/sync-isolation.spec.ts e2e/rehearsal.spec.ts e2e/storage.spec.ts` → 全部通过。

### Step 7: 更新 README

在 `README.md` 的「主持现场常用能力」列表里，`- **离线可用**` 这一条之前加：

```markdown
- **单一正式窗口**：同一浏览器里多个正式抽奖窗口同时打开时，一个窗口保存后，其他窗口会提示刷新并停止保存，避免互相覆盖结果。彩排窗口不受影响。
```

**Verify**：`grep -c "单一正式窗口" README.md` → 输出 `1`。

### Step 8: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e`、`pnpm e2e:pwa` → 全部通过。构建时的“主包大于 500 kB”提示是已知现象，可以忽略。

## Test plan

- `lottery-config.test.ts`：版本递增、拒绝覆盖、`storage` 事件、清空、无关键名、拒绝恢复后可写、旧存档，共 7 个用例。
- `lottery-controller.test.ts`：过期时不能开始、旋转中过期不抽取。
- `lottery-algorithm.test.ts`：过期时作废和撤销都不生效。
- `e2e/multi-window.spec.ts`：真实双窗口流程、彩排隔离。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e` 和 `pnpm e2e:pwa` 退出码为 0
- [ ] `grep -n "addEventListener('storage'" src/views/lottery/core/lottery-config.ts` 有 1 行输出
- [ ] `grep -rn "navigator.locks" src/` 没有输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- `e2e/sync-isolation.spec.ts` 失败：说明过期提示影响了它的断言，报告失败内容，不要改这个测试。
- `pnpm e2e:pwa` 里的升级测试失败：`revision` 可能影响了升级后的恢复，报告，不要改 `e2e/production/`。
- 现有单测在进程内修改 `___lottery___` 后继续用同一模块写入，导致被判过期：报告具体用例，不要放宽比较逻辑。
- 发现需要改 `getLocalStorage()` 函数体才能通过。

## Maintenance notes

- 所有写入 `___lottery___` 的代码都必须经过 `setLocalStorage()`，否则版本比较会失效。
- 存储的比较不是原子操作。两个窗口在同一毫秒写入仍可能相互覆盖，但抽奖由人手触发，这个窗口期可以接受。
- 其他窗口只改揭晓节奏或图片时不会清进度，过期判断也不会触发，那个窗口只是显示旧配置，这是已知边界。
- 计划 012（进度恢复）写入存档时，必须遵守这里的版本规则。
- 审阅时重点看：`knownRevision` 是否在 `getLocalStorage()` 之后无条件同步，写入失败时版本是否保持不变。
