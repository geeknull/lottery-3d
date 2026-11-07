# Plan 008: 种子承诺加盐，并绑定名单顺序和奖项规则

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-rng.ts src/views/lottery/core/lottery-rng.test.ts src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-fairness.ts src/views/lottery/core/lottery-fairness.test.ts src/views/lottery/core/lottery-config.ts src/views/lottery/core/config-restore.ts src/views/lottery/components/LotteryFairness.tsx e2e/fairness.spec.ts README.md docs/compatibility.md`
> 计划 003、005、007 会改 `lottery-config.ts`。如果有改动，逐一对照“现状”里的摘录；摘录对得上就继续，对不上按 STOP 条件处理。

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/005-unique-ids.md（承诺要绑定名单 ID，ID 规则必须先定下来）
- **Category**: security
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

「可验证公平」要求主持人开抽前公布种子承诺指纹。现在的指纹是 `SHA-256("lottery-3d-seed:" + 种子)`，种子只有 2^32 种，而且没有盐。在一台 14 核电脑上实测单线程每秒约 152 万次 SHA-256，按核数外推，几分钟就能穷举全部种子（未实跑全量）。所以公布指纹等于公布种子，任何人拿到公开名单就能算出后续所有中奖人。

另外，名单顺序是抽奖算法的输入，却不在承诺里。知道种子的操作者理论上可以调整名单顺序来选定结果，验证照样通过，面板只能请用户“另行核对名单”。

修完后，新场次的指纹包含 256 位随机盐，并覆盖名单顺序和奖项规则；旧存档和旧验证文件继续按原规则验证。

## Current state

相关文件：

- `src/views/lottery/core/lottery-rng.ts`：随机数和承诺哈希。
- `src/views/lottery/core/fairness-package.ts`：验证文件格式和独立复算器。
- `src/views/lottery/core/lottery-fairness.ts`：为当前场次生成承诺和验证文件。
- `src/views/lottery/core/lottery-config.ts`、`config-restore.ts`：进度持久化与恢复校验。
- `src/views/lottery/components/LotteryFairness.tsx`：公平性面板。

`lottery-rng.ts:56-70`：

```ts
// 种子的承诺哈希（SHA-256）：抽奖开始前公布它，结束后公布种子，
// 任何人都能验证「种子没被根据结果改过」。
// crypto.subtle 仅在 secure context（HTTPS/localhost）可用；file:// 或内网 HTTP 下
// 降级为非加密 FNV-1a（仍是种子的确定性函数、承诺-验证逻辑成立，但密码学强度弱）。
export async function hashSeed(seed: number): Promise<string> {
  const message = `lottery-3d-seed:${seed >>> 0}`
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(message))
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return fnv1a(message)
}
```

`fairness-package.ts:12-27`，验证文件格式：

```ts
export interface VerificationPackage {
  format: 'lottery-3d-verification'
  version: 1
  algorithm: 'mulberry32-v1'
  commitmentAlgorithm: 'sha256' | 'fnv1a32'
  seed: number
  seedCommit: string
  roster: { id: string; name: string }[]
  prizes: { id: string; name: string; count: number; everyTimeGet: number }[]
```

`fairness-package.ts:61-63`，格式校验的开头：

```ts
  if (!record(value) || value.format !== 'lottery-3d-verification' || value.version !== 1 ||
    value.algorithm !== 'mulberry32-v1' || !uint32(value.seed) || typeof value.seedCommit !== 'string') return false
  if (value.commitmentAlgorithm !== 'sha256' && value.commitmentAlgorithm !== 'fnv1a32') return false
```

`fairness-package.ts:96-104`，承诺校验：

```ts
  let commit: string
  if (pkg.commitmentAlgorithm === 'fnv1a32') {
    commit = legacyCommit(pkg.seed)
  } else {
    if (!globalThis.crypto?.subtle) return fail('此环境无法验证 SHA-256 承诺，请在 HTTPS 或 localhost 打开')
    try {
      commit = await hashSeed(pkg.seed)
    } catch {
      return fail('无法计算种子承诺，请稍后重试')
```

`lottery-fairness.ts:42-55`，生成承诺：

```ts
// 计算并固定种子承诺哈希（抽奖开始前公布）。已有则保持不变。
export async function ensureSeedCommit(): Promise<void> {
  while (!lotteryConfig.seedCommit) {
    const seed = lotteryConfig.seed
    const commit = await hashSeed(seed)
    // 哈希期间重置了场次时，旧结果不能写回；继续为当前种子计算。
    if (seed !== lotteryConfig.seed) continue
    // 面板 effect 和按钮可能并发等待同一个种子，先完成者负责唯一的一次落盘和通知。
    if (lotteryConfig.seedCommit) return
    lotteryConfig.seedCommit = commit
    lotteryConfig.setLocalStorage()
    notifyLotteryChange()
  }
}
```

`lottery-fairness.ts:58-67`，生成验证文件：

```ts
export function createVerificationPackage(): VerificationPackage {
  return {
    format: 'lottery-3d-verification',
    version: 1,
    algorithm: 'mulberry32-v1',
    commitmentAlgorithm: lotteryConfig.seedCommit.length === 8 ? 'fnv1a32' : 'sha256',
    seed: lotteryConfig.seed,
    seedCommit: lotteryConfig.seedCommit,
    roster: lotteryConfig.cardList.map(({ id, name }) => ({ id, name })),
    prizes: lotteryConfig.prizeList.map(({ id, name, count, everyTimeGet }) => ({ id, name, count, everyTimeGet })),
```

`lottery-config.ts` 中与种子相关的行：第 32 行接口字段 `seedCommit: string;`，第 74 行 `const initialSeed = randomSeed();`，第 91–93 行对象初始值，第 124–126 行保存字段，第 184–189 行恢复：

```ts
    if (typeof saved.seed === 'number') {
      lotteryConfig.seed = saved.seed;
      lotteryConfig.rngState = typeof saved.rngState === 'number' ? saved.rngState : saved.seed;
      lotteryConfig.seedCommit = saved.seedCommit ?? '';
      lotteryConfig.drawLog = saved.drawLog ?? [];
    }
```

`config-restore.ts:17-19` 和 `:73-75`：`SavedProgress` 有 `seed?`、`seedCommit?`，校验 `saved.seedCommit !== undefined && typeof saved.seedCommit !== 'string'` 时拒绝。

`LotteryFairness.tsx` 中要改的文案（第 23 行注释，以及介绍和提示两段）：

```tsx
  // 打开即锁定承诺哈希（种子已在加载时确定，提前公布也无妨）
```

```tsx
        验证通过表示文件内部的承诺、规则与结果一致；请另行核对开抽前公布的指纹与名单。
```

```tsx
        <p className="hint">{lotteryConfig.seedCommit.length === 8 ? 'FNV-1a（兼容模式，非加密校验）' : 'SHA-256'}。请在开抽前记录并公布此值，验证时与原记录核对。</p>
```

已核实的测试环境事实（会影响要改哪些测试）：

- vitest 的 jsdom 环境里 `globalThis.crypto.subtle` **存在**，所以默认情况下单测会走新的加盐路径。
- `lottery-fairness.test.ts` 里有用例用 `vi.spyOn(rng, 'hashSeed')` 拦截哈希，所以新路径仍要调用 `hashSeed`，不能另起一个函数名。
- `src/views/lottery/components/LotteryFairness.test.tsx` 把 `lotteryConfig` mock 成 `{ seed: 7, seedCommit: '', drawLog: [] }`，没有 `seedSalt`，面板代码要能处理 `undefined`。

## 设计

- 新字段 `seedSalt`：64 位十六进制字符串，和种子一起在模块加载时生成，随进度持久化。
- 新承诺：`SHA-256("lottery-3d-commitment-v2:" + seed + ":" + salt + ":" + context)`。`context` 是名单 `[id, name]` 和奖项 `[id, name, count, everyTimeGet]` 的有序 JSON。揭晓节奏和图片不参与，和配置指纹的口径一致。
- 验证文件 `version: 2`、`commitmentAlgorithm: 'sha256-salted'`、带 `seedSalt`。
- **兼容**：
  - 旧存档已经有承诺、但没有盐：保持原承诺，`seedSalt` 为空串，导出 v1 验证文件。
  - 旧存档有种子但还没生成承诺：直接用本次加载的新盐。
  - 非安全上下文（内网 HTTP，没有 `crypto.subtle`）：退回原来的 FNV 承诺，`seedSalt` 置空，导出 v1。
  - v1 验证文件（`sha256`、`fnv1a32`）的验证逻辑一行不改。

### 本计划不解决的问题

随机数发生器的内部状态仍是 32 位。活动进行中，有人可以拿公开名单和前几轮已公布的中奖人，穷举 2^32 个种子反推出随机状态，进而预测后续轮次。加盐只堵住了“从指纹反推”这条路。所以面板文案**不能**承诺“结果不可预测”。升级随机算法属于另一个改动，见“Maintenance notes”。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/lottery-fairness.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/fairness.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |
| PWA E2E | `pnpm e2e:pwa` | 全部通过，独占端口 18181 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/lottery-rng.ts`
- `src/views/lottery/core/lottery-rng.test.ts`
- `src/views/lottery/core/fairness-package.ts`
- `src/views/lottery/core/lottery-fairness.ts`
- `src/views/lottery/core/lottery-fairness.test.ts`
- `src/views/lottery/core/lottery-config.ts`（只改种子相关的行）
- `src/views/lottery/core/config-restore.ts`
- `src/views/lottery/components/LotteryFairness.tsx`
- `e2e/fairness.spec.ts`
- `README.md`（只改「可验证公平」一条）
- `docs/compatibility.md`（只改 `crypto.subtle` 一行）
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 随机算法 `mulberry32-v1`、`rngState`、`poolIds`：一律不动。
- `legacyCommit` 和 v1 的验证分支。
- `verifyDrawLog`、`replaySequence`：不要顺手删改。
- 不要在面板上隐藏或移动“当前种子”的显示。

## Git workflow

- 分支：`advisor/008-salted-seed-commitment`
- 提交信息用中文并带前缀，例如 `fix: 种子承诺加盐并绑定名单与奖项规则`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 在 lottery-rng.ts 加随机盐和带绑定的承诺

1. 在 `randomSeed` 之后加：

```ts
// 承诺用的随机盐（32 字节十六进制）。有了它，公布的指纹无法通过穷举 2^32 个种子反推。
export function randomSalt(): string {
  const bytes = new Uint8Array(32)
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
```

2. 把 `hashSeed` 改成（注释保留并补一句）：

```ts
export interface SeedBinding {
  salt: string // randomSalt() 的结果
  context: string // 名单顺序与奖项规则，由 fairness-package 的 commitmentContext 生成
}

// （保留原有 4 行注释）
// 传入 binding 时生成 v2 承诺：加盐并绑定名单与规则。v2 只用 SHA-256，没有降级。
export async function hashSeed(seed: number, binding?: SeedBinding): Promise<string> {
  const message = binding
    ? `lottery-3d-commitment-v2:${seed >>> 0}:${binding.salt}:${binding.context}`
    : `lottery-3d-seed:${seed >>> 0}`
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(message))
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  if (binding) throw new Error('加盐承诺需要 SHA-256，请在 HTTPS 或 localhost 打开')
  return fnv1a(message)
}
```

3. 在 `lottery-rng.test.ts` 里加用例（先读文件里现有 `hashSeed` 用例的写法，照着组织）：
   - `randomSalt()` 返回 `/^[0-9a-f]{64}$/`，两次调用结果不同。
   - 同一个 `binding` 结果相同；换 `salt` 或换 `context`，结果不同；和不带 `binding` 的结果也不同。
   - `vi.stubGlobal('crypto', {})` 时，带 `binding` 调用会 reject，不带时返回 8 位十六进制。用例结束要 `vi.unstubAllGlobals()`。

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-rng.test.ts` → 全部通过。

### Step 2: 扩展验证文件格式

修改 `fairness-package.ts`：

1. import 改成 `import { hashSeed, rngFromState } from './lottery-rng'`（不变），接口改成：

```ts
export interface VerificationPackage {
  format: 'lottery-3d-verification'
  version: 1 | 2
  algorithm: 'mulberry32-v1'
  commitmentAlgorithm: 'sha256' | 'fnv1a32' | 'sha256-salted'
  seed: number
  seedSalt?: string // 仅 version 2：承诺用的随机盐
  seedCommit: string
  // 其余字段不变
```

2. 在 `record` 函数之前加：

```ts
// v2 承诺绑定的名单顺序和奖项规则。揭晓节奏、图片不参与，和配置指纹的口径一致。
export function commitmentContext(roster: VerificationPackage['roster'], prizes: VerificationPackage['prizes']): string {
  return JSON.stringify({
    roster: roster.map(({ id, name }) => [id, name]),
    prizes: prizes.map(({ id, name, count, everyTimeGet }) => [id, name, count, everyTimeGet]),
  })
}

export function isSeedSalt(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}
```

3. 把 `validPackage` 的前三行改成：

```ts
  if (!record(value) || value.format !== 'lottery-3d-verification' || (value.version !== 1 && value.version !== 2) ||
    value.algorithm !== 'mulberry32-v1' || !uint32(value.seed) || typeof value.seedCommit !== 'string') return false
  if (value.version === 1 && value.commitmentAlgorithm !== 'sha256' && value.commitmentAlgorithm !== 'fnv1a32') return false
  if (value.version === 2 && (value.commitmentAlgorithm !== 'sha256-salted' || !isSeedSalt(value.seedSalt))) return false
```

4. 把承诺校验里的 `commit = await hashSeed(pkg.seed)` 改成：

```ts
      commit = pkg.version === 2
        ? await hashSeed(pkg.seed, { salt: pkg.seedSalt!, context: commitmentContext(pkg.roster, pkg.prizes) })
        : await hashSeed(pkg.seed)
```

`pkg.seedSalt` 已由 `validPackage` 校验过，这里的 `!` 是安全的。

**Verify**：`pnpm type-check` → exit 0。

### Step 3: 持久化 seedSalt

修改 `lottery-config.ts`：

1. import 改成 `import { randomSalt, randomSeed } from './lottery-rng';`
2. 接口在 `seedCommit` 之后加：`seedSalt: string; // 承诺用的随机盐。旧存档和非安全上下文为空串`
3. `const initialSeed = randomSeed();` 之后加 `const initialSalt = randomSalt();`
4. 对象初始值在 `seedCommit: '',` 之后加 `seedSalt: initialSalt,`
5. `setLocalStorage` 的保存字段在 `seedCommit: lotteryConfig.seedCommit,` 之后加 `seedSalt: lotteryConfig.seedSalt,`
6. 恢复部分在 `lotteryConfig.seedCommit = saved.seedCommit ?? '';` 之后加：

```ts
      // 旧存档的承诺没有盐，保持原样；还没生成承诺的旧存档直接用本次的新盐。
      lotteryConfig.seedSalt = saved.seedSalt ?? (lotteryConfig.seedCommit ? '' : initialSalt);
```

修改 `config-restore.ts`：

1. `SavedProgress` 在 `seedCommit?: string` 之后加 `seedSalt?: string`。
2. 在 `seedCommit` 的校验之后加：

```ts
  if (saved.seedSalt !== undefined && (typeof saved.seedSalt !== 'string' || !/^([0-9a-f]{64})?$/.test(saved.seedSalt))) return false
```

**Verify**：`pnpm type-check` → exit 0。

### Step 4: 生成 v2 承诺和验证文件

修改 `lottery-fairness.ts`：

1. import 加上 `commitmentContext`：`import { commitmentContext, verifyVerificationPackage } from './fairness-package'`。
2. 在 `ensureSeedCommit` 之前加：

```ts
const currentRoster = () => lotteryConfig.cardList.map(({ id, name }) => ({ id, name }))
const currentPrizes = () => lotteryConfig.prizeList.map(({ id, name, count, everyTimeGet }) => ({ id, name, count, everyTimeGet }))
```

3. 把 `ensureSeedCommit` 改成：

```ts
// 计算并固定种子承诺哈希（抽奖开始前公布）。已有则保持不变。
export async function ensureSeedCommit(): Promise<void> {
  while (!lotteryConfig.seedCommit) {
    const seed = lotteryConfig.seed
    // 非安全上下文没有 SHA-256，只能退回旧的无盐承诺。
    const salt = globalThis.crypto?.subtle ? lotteryConfig.seedSalt : ''
    const commit = salt
      ? await hashSeed(seed, { salt, context: commitmentContext(currentRoster(), currentPrizes()) })
      : await hashSeed(seed)
    // 哈希期间重置了场次时，旧结果不能写回；继续为当前种子计算。
    if (seed !== lotteryConfig.seed) continue
    // 面板 effect 和按钮可能并发等待同一个种子，先完成者负责唯一的一次落盘和通知。
    if (lotteryConfig.seedCommit) return
    lotteryConfig.seedSalt = salt
    lotteryConfig.seedCommit = commit
    lotteryConfig.setLocalStorage()
    notifyLotteryChange()
  }
}
```

4. 把 `createVerificationPackage` 的开头改成（`roster`、`prizes` 改用上面的函数，其余字段不变）：

```ts
export function createVerificationPackage(): VerificationPackage {
  const salted = Boolean(lotteryConfig.seedSalt) && lotteryConfig.seedCommit.length === 64
  return {
    format: 'lottery-3d-verification',
    version: salted ? 2 : 1,
    algorithm: 'mulberry32-v1',
    commitmentAlgorithm: salted ? 'sha256-salted' : lotteryConfig.seedCommit.length === 8 ? 'fnv1a32' : 'sha256',
    seed: lotteryConfig.seed,
    ...(salted ? { seedSalt: lotteryConfig.seedSalt } : {}),
    seedCommit: lotteryConfig.seedCommit,
    roster: currentRoster(),
    prizes: currentPrizes(),
```

**Verify**：`pnpm type-check` → exit 0。

### Step 5: 更新受影响的单测

在 `lottery-fairness.test.ts` 里做这些修改。不要改其他用例的断言：

1. import 加上 `commitmentContext`：`import { commitmentContext, verifyVerificationPackage } from './fairness-package'`。
2. `it('首次调用填充种子承诺哈希并持久化')` 的断言改成：

```ts
    expect(lotteryConfig.seedCommit).toBe(await hashSeed(123, {
      salt: lotteryConfig.seedSalt,
      context: commitmentContext(
        lotteryConfig.cardList.map(({ id, name }) => ({ id, name })),
        lotteryConfig.prizeList.map(({ id, name, count, everyTimeGet }) => ({ id, name, count, everyTimeGet })),
      ),
    }))
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    expect(saved.seedCommit).toBe(lotteryConfig.seedCommit)
    expect(saved.seedSalt).toMatch(/^[0-9a-f]{64}$/)
```

3. `it('验证 SHA-256 承诺，并拒绝替换后的承诺')` 里把 `toBe('sha256')` 改成 `toBe('sha256-salted')`，并加 `expect(pkg.version).toBe(2)`。
4. `it('拒绝重复 ID、未知版本及损坏字段，不抛异常')` 里把 `{ ...pkg, version: 2 }` 改成 `{ ...pkg, version: 3 }`（默认包现在就是 v2，原来的写法不再是非法输入）。
5. 在 `describe('完整验证文件')` 里、`drawPackage` 之后加一个辅助函数，并让 `it('拒绝与抽取人数不一致的奖项规则')` 改用它，因为 v2 包修改奖项规则会先在承诺这一步失败，测不到复算分支：

```ts
  // 复算规则对 v1、v2 相同。用 v1 包绕开 v2 的承诺绑定，专门测复算分支。
  async function legacyPackage() {
    const { seedSalt: _salt, ...pkg } = await drawPackage()
    return { ...pkg, version: 1 as const, commitmentAlgorithm: 'sha256' as const, seedCommit: await hashSeed(pkg.seed) }
  }
```

本步骤里所有 `const { seedSalt: _salt, ...pkg } = ...` 的解构（包括下面第 6 点的用例），如果 `pnpm lint` 报 `_salt` 未使用，都改用 `const pkg: Partial<VerificationPackage> = { ...(await drawPackage()) }; delete pkg.seedSalt` 的写法（`VerificationPackage` 从 `./fairness-package` 以 `import type` 引入），其余逻辑不变。

6. 在 `describe('完整验证文件')` 末尾加新用例：

```ts
  it('v2 承诺绑定名单顺序、奖项规则和盐', async () => {
    const pkg = await drawPackage()
    expect(pkg.version).toBe(2)
    for (const tampered of [
      { ...pkg, roster: [...pkg.roster].reverse() },
      { ...pkg, prizes: [{ ...pkg.prizes[0], count: pkg.prizes[0].count + 1 }, ...pkg.prizes.slice(1)] },
      { ...pkg, seedSalt: 'f'.repeat(64) },
    ]) expect((await verifyVerificationPackage(tampered)).reason).toContain('承诺不一致')
  })

  it('v2 包缺少盐时按格式无效拒绝', async () => {
    const { seedSalt: _salt, ...pkg } = await drawPackage()
    expect((await verifyVerificationPackage(pkg)).reason).toContain('格式无效')
  })

  it('旧的 v1 SHA-256 验证文件仍能通过', async () => {
    expect((await verifyVerificationPackage(await legacyPackage())).ok).toBe(true)
  })

  it('已有无盐承诺的旧存档继续导出 v1', async () => {
    lotteryConfig.seed = 42
    lotteryConfig.rngState = 42
    lotteryConfig.seedSalt = ''
    lotteryConfig.seedCommit = await hashSeed(42)
    getRandomCard(lotteryConfig.prizeList[0])
    const pkg = fairness.createVerificationPackage()
    expect(pkg).toMatchObject({ version: 1, commitmentAlgorithm: 'sha256' })
    expect(pkg).not.toHaveProperty('seedSalt')
    expect((await verifyVerificationPackage(pkg)).ok).toBe(true)
  })
```

**Verify**：`pnpm test` → 全部通过。如果有不在上面列表里的用例失败，按 STOP 条件处理。

### Step 6: 更新面板文案

修改 `LotteryFairness.tsx`：

1. 第 23 行注释改成 `// 打开即锁定承诺哈希。承诺含随机盐，公布指纹不会泄露种子`。
2. 在 `const drawCount = ...` 之后加：

```tsx
  // 测试里的 mock 没有 seedSalt，所以用 Boolean 兜住 undefined
  const salted = Boolean(lotteryConfig.seedSalt) && lotteryConfig.seedCommit.length === 64
```

3. 介绍段第二句改成：

```tsx
        验证通过表示文件内部的承诺、规则与结果一致；{salted ? '指纹已绑定本场名单顺序和奖项规则，请核对开抽前公布的指纹。' : '请另行核对开抽前公布的指纹与名单。'}
```

4. 提示段改成：

```tsx
        <p className="hint">{lotteryConfig.seedCommit.length === 8 ? 'FNV-1a（兼容模式，非加密校验）' : salted ? 'SHA-256（含随机盐，绑定名单顺序与奖项规则）' : 'SHA-256'}。请在开抽前记录并公布此值，验证时与原记录核对。</p>
```

“当前种子”那一段及其提示保持不变。

**Verify**：`pnpm exec vitest run src/views/lottery/components/LotteryFairness.test.tsx` → 全部通过。

### Step 7: 更新端到端测试

修改 `e2e/fairness.spec.ts`：

1. 把 `expect(pkg.commitmentAlgorithm).toBe('sha256')` 改成：

```ts
  expect(pkg.commitmentAlgorithm).toBe('sha256-salted')
  expect(pkg.version).toBe(2)
  expect(pkg.seedSalt).toMatch(/^[0-9a-f]{64}$/)
```

2. 在 `pkg.seedCommit = '0'.repeat(64)` 这一行之前，插入名单顺序篡改的检查：

```ts
    await verifier.locator('.lottery-fairness input[type=file]').setInputFiles({
      name: 'reordered-verification.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ ...pkg, roster: [...pkg.roster].reverse() })),
    })
    await expect(verifier.locator('.verify-result.fail')).toContainText('种子与已公布的承诺不一致')
```

**Verify**：`pnpm e2e e2e/fairness.spec.ts` → 通过。

### Step 8: 更新文档

1. `README.md` 的「可验证公平」一条，把“验证结果说明文件内部一致，仍需核对开抽前公布的指纹与名单；”改成：

```markdown
验证结果说明文件内部一致。在 HTTPS 或 localhost 下，开抽前公布的指纹含随机盐，并绑定名单顺序和奖项规则；内网 HTTP 下退回旧的兼容指纹，仍需另行核对名单。
```

这一条其余文字保持不变。

2. `docs/compatibility.md` 表格里 `crypto.subtle` 一行的第三列改成：`缺失时使用弱哈希，且不加盐、不绑定名单；不具有相同的密码学保证`。

**Verify**：`grep -c "随机盐" README.md` → 输出 `1`。

### Step 9: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e`、`pnpm e2e:pwa` → 全部通过。

## Test plan

- `lottery-rng.test.ts`：盐的格式与随机性、绑定改变结果、无 SHA-256 时拒绝 v2。
- `lottery-fairness.test.ts`：v2 绑定名单、规则和盐；缺盐；v1 文件仍可验证；旧存档继续导出 v1；Step 5 列出的 4 处调整。
- `e2e/fairness.spec.ts`：真实导出的 v2 文件跨上下文验证、名单重排被拒绝、篡改承诺被拒绝。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e`、`pnpm e2e:pwa` 退出码为 0
- [ ] `grep -n "提前公布也无妨" src/` 没有输出
- [ ] `grep -n "mulberry32-v1" src/views/lottery/core/fairness-package.ts` 仍有输出（算法标识没变）
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- 计划 005 还没完成（`grep -n "createIdAllocator" src/views/lottery/core/lottery-config-users.ts` 没有输出）。
- Step 5 没列出的现有用例失败，尤其是作废、撤销、小数名额相关的复算用例：说明改动碰到了复算逻辑，立即停下。
- `pnpm e2e:pwa` 的升级用例失败：可能是旧版本存档和新字段不兼容，报告详情。
- 发现需要改随机算法、`rngState` 或 `poolIds` 才能完成。

## Maintenance notes

- **遗留风险**：随机状态仍是 32 位，前几轮中奖结果公开后，后续轮次在理论上可以被预测。如果要彻底解决，需要设计 `algorithm: 'v2'`（更大的种子和状态，或用 SHA-256 按轮派生随机数），并保持 `mulberry32-v1` 的验证兼容。计划 014 会把它列为待决问题。
- 以后验证文件再加字段时，用 `version` 区分，不要改动 v1、v2 已有的语义。
- 计划 012（进度恢复）和 014（公证卡）都依赖这里的 `seedSalt` 与 `commitmentContext`。
- 审阅时重点看：v1 分支完全没改；`ensureSeedCommit` 在非安全上下文把 `seedSalt` 置空；`createVerificationPackage` 判断 v2 时同时要求有盐、承诺长度为 64。
