# Plan 016: 开抽前公证卡（全屏浮层、打印、PNG）与开始时的一次性提醒

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行。
>
> **漂移检查（先运行）**：`git diff --stat cd58f69..HEAD -- src/views/lottery/components/LotteryFairness.tsx src/views/lottery/components/lottery-fairness.scss src/views/lottery/core/lottery-controller.ts src/views/lottery/core/poster.ts e2e/fairness.spec.ts README.md`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW（不碰随机算法、验证文件格式、`phase` 状态机）
- **Depends on**: 008（加盐承诺）、设计 014
- **Category**: direction
- **Planned at**: commit `cd58f69`, 2026-11-13

## Why this matters

开抽前公布承诺指纹是“可验证公平”的前提，但现在面板只把 64 位十六进制显示成一整串，主持人要手工抄，现场核对容易串行。公证卡把指纹按 8 位一组排成两行、给出 8 位短码，做成能投屏、打印、导出 PNG 的卡片；按指纹状态和是否已抽给出不同标签，避免旧存档、兼容模式或开抽后的卡被误当成开抽前凭证。第一次点“开始”时如果本页还没打开过公证卡，再给一条不阻塞的提醒。

## Current state

设计文档：`docs/superpowers/specs/2026-11-13-pre-draw-attestation-design.md`“一、公证卡”。采用的答案：`plans/decisions-2026-11-13.md` 014 部分。

- `src/views/lottery/components/LotteryFairness.tsx` —— 公平性面板。第 24–26 行打开即 `ensureSeedCommit()`；第 30 行 `salted = Boolean(lotteryConfig.seedSalt) && lotteryConfig.seedCommit.length === 64`；第 98–102 行指纹一整串 `<code className="mono">`。面板根节点 `.lottery-fairness`，`useOnEscape(onClose)`。
- `src/views/lottery/core/lottery-fairness.ts:42-43` —— `currentRoster`、`currentPrizes`（`{ id, name, count, everyTimeGet }`）。
- `src/views/lottery/core/lottery-config.ts` —— `headerTitle`、`cardList`、`prizeList`、`seedCommit`（异步算出前为空串）、`seedSalt`（旧存档和非安全上下文为空串）、`drawLog`（`type: 'draw' | 'void' | 'undo'`）。
- `src/views/lottery/core/poster.ts` —— canvas 纯文字喜报，`downloadDataUrl(dataUrl, filename)` 未导出；canvas 不可用时返回 `''`。
- `src/views/lottery/core/lottery-status.ts` —— `phase` 唯一运行状态；`isWait()` 为 `idle` 或 `presenting`（没有动画在跑，等主持人操作）。
- `src/views/lottery/core/lottery-controller.ts:102-145` —— `start()`：所有入口（主按钮、键盘 `toggleDraw`、双屏控制窗命令）都经 `dispatchLotteryCommand` 进入这里；校验通过后第 113 行 `STATUS.setPhase('preparing')`。
- `src/views/lottery/core/lottery-shortcuts.ts:59` —— `.lottery-fairness` 存在时快捷键被屏蔽，所以浮层放在面板 DOM 里，开浮层期间空格不会开抽。
- `src/views/lottery/components/feedback.tsx` —— `toast(message, duration)` 是不阻塞的轻提示。
- 彩排：`src/views/lottery/core/rehearsal.ts` 的 `isRehearsal()`。

指纹三种状态（设计第 1 问）：

| 条件 | 状态 | 卡片 |
|---|---|---|
| `seedCommit` 为空 | 生成中 | 按钮置灰“指纹生成中” |
| `seedCommit.length === 8` | FNV-1a 兼容 | 不出卡，按钮置灰并说明“此环境只有非加密的 8 位指纹，请用 HTTPS 或 localhost 打开” |
| 64 位且 `seedSalt` 非空 | 加盐 SHA-256 | 正常卡 |
| 64 位且 `seedSalt` 为空 | 旧存档无盐 SHA-256 | 出卡，醒目标签“仅绑定种子，不绑定名单和奖项规则” |

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单测 | `pnpm exec vitest run --dir src` | 全部通过 |
| 脚本单测 | `pnpm exec vitest run scripts/gen-release-notes.test.mjs` | 3 项通过 |
| 单文件 E2E | `pnpm e2e e2e/attestation.spec.ts` | 全部通过，独占端口 18180 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `src/views/lottery/core/attestation.ts`（新建）：纯函数 `buildAttestation()`、`groupFingerprint()`、`attestationUnavailableReason()`
- `src/views/lottery/core/attestation.test.ts`（新建）
- `src/views/lottery/core/attestation-reminder.ts`（新建）：本页内“是否打开过公证卡 / 是否提醒过”
- `src/views/lottery/core/attestation-reminder.test.ts`（新建）
- `src/views/lottery/core/attestation-png.ts`（新建）、`attestation-png.test.ts`（新建）
- `src/views/lottery/core/poster.ts`（只导出 `downloadDataUrl`）
- `src/views/lottery/components/LotteryAttestation.tsx`（新建）、`lottery-attestation.scss`（新建）、`LotteryAttestation.test.tsx`（新建）
- `src/views/lottery/components/LotteryFairness.tsx`（只加“公证卡”按钮、浮层挂载和 Escape 处理）
- `src/views/lottery/components/LotteryFairness.test.tsx`
- `src/views/lottery/core/lottery-controller.ts`（`start()` 里加一行提醒）、`lottery-controller.test.ts`
- `e2e/attestation.spec.ts`（新建）
- `README.md`（“可验证公平”一条）
- `plans/README.md`

**Out of scope**：
- `lottery-rng.ts`、`fairness-package.ts` 校验逻辑、验证文件 version/格式、`configHash`、名单顺序。
- `phase` 状态机：提醒不改阶段、不等待、不阻塞开始。
- 不加二维码、不加依赖、不做观众随机数。
- 卡片不得出现种子、盐、姓名。
- “是否展示过公证卡”不写存档（localStorage/IndexedDB 都不写）。

## Git workflow

- 分支：`claude/upbeat-hodgkin-77ae46`（总控派发的 worktree 分支）
- 一项一提交，中文，带前缀：
  1. `feat: 公证卡数据与状态判定`
  2. `feat: 公证卡全屏浮层与打印样式`
  3. `feat: 公证卡导出 PNG`
  4. `feat: 第一次开始抽奖时提醒还没展示公证卡`
  5. `docs: README 说明公证卡`

## Steps

### Step 1: 公证卡数据与状态判定

新建 `core/attestation.ts`，不 import `lottery-config`（输入全部由调用方传入，便于测试）：

```ts
export type CommitKind = 'pending' | 'fnv' | 'unsalted' | 'salted'
export interface AttestationInput {
  title: string; seedCommit: string; seedSalt: string; rosterCount: number
  prizes: { name: string; count: number; everyTimeGet: number }[]
  drawLog: { type: string }[]; rehearsal: boolean; now: Date
}
export interface Attestation {
  kind: 'unsalted' | 'salted'
  title: string                 // `${title} 开抽前公证卡`
  groups: string[]              // 8 组，每组 8 位
  rows: [string[], string[]]    // 两行各 4 组
  shortCode: string             // 前 8 位
  rosterLine: string            // `名单 N 人`
  prizeLines: string[]          // `奖项名 × 名额（每轮 k 人）`
  binding: string               // 正常卡：绑定范围（含“含工号（如有）”）；无盐卡：标签文案
  algorithm: string
  generatedAt: string           // `YYYY-MM-DD HH:mm:ss`
  timeNote: '本机时间，不能作为公布时间的证明'
  verifySteps: string[]         // 3 行核对方法
  drawnRounds: number
  stageLabel: string            // '开抽前' 或 `本场已抽 N 轮，此卡不是开抽前凭证`
  watermark: string | null      // 彩排：'彩排，不具效力'
}
export function commitKind(seedCommit: string, seedSalt: string): CommitKind
export function groupFingerprint(hex: string): string[]
export function attestationUnavailableReason(kind: CommitKind): string | null
export function buildAttestation(input: AttestationInput): Attestation | null   // pending/fnv 返回 null
```

“已抽 N 轮”与面板口径一致：`drawLog` 中 `type === 'draw'` 的条数（被撤销的轮次也计入，它们同样消耗了随机流）。

**Verify**：`pnpm exec vitest run src/views/lottery/core/attestation.test.ts` → 覆盖三种指纹状态（加 pending）、已抽/未抽、彩排水印、分组格式（8 组 × 8 位、两行各 4 组）、短码、输出不含种子/盐/姓名，全部通过。

### Step 2: 全屏浮层与打印样式

- 新建 `components/LotteryAttestation.tsx`：`role="dialog" aria-modal="true" aria-label="开抽前公证卡"`，全部用 React 文本渲染；按钮“导出 PNG”（Step 3 接入）、“打印”（`window.print()`）、“关闭”。
- 新建 `lottery-attestation.scss`：深色底大字号；`@media print` 时页面其他元素 `visibility: hidden`，卡片黑字白底、隐藏按钮。
- `LotteryFairness.tsx`：
  - 加 `const phase = useSyncExternalStore(STATUS.subscribe, STATUS.getPhase)`；`STATUS.isWait()`（`idle`/`presenting`）以外按钮不可用，提示“抽奖进行中，结束后再打开”。
  - 按 `attestationUnavailableReason()` 置灰并显示原因。
  - 点按钮：`markAttestationShown()`（Step 4 的模块，本步先建 `attestation-reminder.ts` 的 `markAttestationShown`），打开浮层。
  - 浮层打开期间阶段离开空闲（双屏控制窗发起抽奖）时自动关闭浮层。
  - `useOnEscape`：浮层打开时 Escape 只关浮层。

**Verify**：组件测试（按钮状态、浮层文本、水印、红字、Escape）通过；`pnpm e2e e2e/attestation.spec.ts`：打开浮层，卡片分组拼起来等于面板指纹；抽一轮后卡片显示“本场已抽 1 轮，此卡不是开抽前凭证”。

### Step 3: 导出 PNG

- `poster.ts` 导出 `downloadDataUrl`。
- 新建 `core/attestation-png.ts`：`renderAttestationPng(att): string`（canvas 只画文字，自动换行，按内容算高度；彩排斜向水印；已抽红字在顶部和页脚都画），`exportAttestationPng(att): boolean`，文件名 `公证卡-<短码>.png`，彩排为 `公证卡-彩排-<短码>.png`。

**Verify**：单测用假 2D context 记录 `fillText`：包含分组指纹、短码、红字（顶部和页脚）、彩排水印，不包含种子；canvas 不可用时返回 `''` 且不触发下载。E2E 点击“导出 PNG”拿到 `公证卡-<短码>.png`，文件头是 PNG。

### Step 4: 第一次开始时的一次性提醒

`core/attestation-reminder.ts`：

```ts
let shown = false
let reminded = false
export function markAttestationShown(): void
// 本页第一次开始、场次还没有抽奖记录、且本页没打开过公证卡时返回 true，只返回一次
export function takeStartReminder(hasDraws: boolean): boolean
export function resetAttestationReminder(): void // 仅测试
```

`lottery-controller.ts` 的 `start()` 在 `STATUS.setPhase('preparing')` 之后加：

```ts
if (takeStartReminder(lotteryConfig.drawLog.some(e => e.type === 'draw'))) toast('提醒：本场还没有展示开抽前公证卡（🛡 公平性 → 公证卡），本轮照常进行', 6000)
```

挂在 `start()` 而不是按钮上：主按钮、键盘 `toggleDraw`、双屏控制窗命令都经 `dispatchLotteryCommand` → `start()`，一处覆盖全部入口；放在阶段已切到 `preparing` 之后，被校验拦下的无效开始不会消耗提醒。`toast` 不等待，不改变开始节奏。

**Verify**：`attestation-reminder.test.ts` 和 `lottery-controller.test.ts` 新用例：只在第一次开始且没打开过卡片时提示一次；打开过卡片不提示；已有抽奖记录不提示；键盘/双屏同样走 `dispatchLotteryCommand({ action: 'toggleDraw' })` 时也提示。

### Step 5: README

“可验证公平”一条补一句公证卡用法。

**Verify**：`grep -c "公证卡" README.md` ≥ 1。

## Test plan

- `attestation.test.ts`、`attestation-png.test.ts`、`attestation-reminder.test.ts`、`LotteryAttestation.test.tsx`、`LotteryFairness.test.tsx`、`lottery-controller.test.ts` 新用例。
- `e2e/attestation.spec.ts`：浮层指纹与面板一致；抽一轮后红字；导出 PNG 文件名和文件头。

## Done criteria

- [ ] `pnpm type-check`、`pnpm lint` exit 0
- [ ] `pnpm exec vitest run --dir src` 全部通过；脚本 3 项通过
- [ ] `pnpm e2e e2e/attestation.spec.ts` 通过
- [ ] 红灯检查：逐个退回生产文件，新测试失败
- [ ] 生产构建验收截图：正常卡、已抽红字卡、彩排水印卡、导出 PNG、开始提醒
- [ ] `git diff cd58f69 -- src/views/lottery/core/lottery-rng.ts src/views/lottery/core/fairness-package.ts pnpm-lock.yaml package.json` 为空
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 需要修改 `fairness-package.ts` 校验逻辑、`lottery-rng.ts` 或验证文件格式才能完成。
- 提醒必须改变 `phase` 或阻塞开始才能实现。
- 现有 `e2e/fairness.spec.ts` 断言失败。

## Maintenance notes

- 计划 013 合入后，名单承诺会带工号；卡片只写人数和“含工号（如有）”，不用改。
- 路线 B（随机算法升级）若以后要做，`algorithm` 文案改为读取验证文件的 `algorithm`。
- 双屏模式下提醒只出现在展示窗（toast 不同步到控制窗），见 PR“没覆盖到的地方”。
