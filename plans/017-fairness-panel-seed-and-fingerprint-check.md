# Plan 017: 公平性面板默认隐藏种子、醒目风险提示，导入验证文件时核对指纹

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行。
>
> **漂移检查（先运行）**：`git diff --stat cd58f69..HEAD -- src/views/lottery/components/LotteryFairness.tsx src/views/lottery/components/lottery-fairness.scss e2e/fairness.spec.ts`
> 计划 016 会先改 `LotteryFairness.tsx`（加公证卡按钮）。除此之外有改动时，先对照“现状”；对不上就按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/016-pre-draw-attestation-card.md（复用 `groupFingerprint()`、指纹分组组件）
- **Category**: direction
- **Planned at**: commit `cd58f69`, 2026-11-13

## Why this matters

决策文件 014 #1、#5 已定不做随机算法升级，种子一旦公开，后续每一轮都可以算出来。现在面板一直显示“当前种子”，风险提示只是灰色小字，活动中途投屏或拍照就会泄露。改成默认隐藏、点“显示种子”才显示，风险提示改成醒目的警示框，导出按钮旁提示“活动结束后再分享”。

另外，导入验证文件后面板只说“通过/未通过”，不显示文件里的指纹，核对公证卡只能肉眼比 64 位。设计第 4 问：结果区显示文件 `seedCommit`（同样分组），并加“核对卡片指纹”输入框。

## Current state

- `src/views/lottery/components/LotteryFairness.tsx`（基线行号）：
  - 第 92–96 行说明文字，含“本地验证无法证明公布时间，也无法阻止整份数据被替换”——**必须保留**。
  - 第 104–108 行：`<h3>当前种子</h3><code className="mono">{lotteryConfig.seed}</code>`，提示里有“已记录 {drawCount} 轮抽奖”（`e2e/fairness.spec.ts:43、49` 依赖这句）和“种子公开后，后续结果可预测，建议活动结束后分享文件”。
  - 第 110–116 行：“立即自验证 / 复制验证数据 / 下载验证文件 / 验证文件”按钮。
  - 第 70–83 行 `handleImport`：`verifyVerificationPackage(JSON.parse(await file.text()))`，结果只存 `VerifyResult`。
- `src/views/lottery/core/fairness-package.ts` —— 校验器，本计划**不改**。导入后只在组件里读 `seedCommit` 字段做显示和比对。

采用的答案（`plans/decisions-2026-11-13.md` 014）：

- #1【已定】：面板里“种子公开后后续结果可预测”的提示改得更醒目。
- #5【请过目】：面板默认隐藏种子，点“显示种子”才显示并附风险提示；导出文件格式不变；导出按钮旁提示“活动结束后再分享”。

## Commands you will need

同计划 016；单文件 E2E 为 `pnpm e2e e2e/attestation.spec.ts`、`pnpm e2e e2e/fairness.spec.ts`。

## Scope

**In scope**：
- `src/views/lottery/core/attestation.ts`（加 `compareFingerprint()`、`readPackageCommit()`）、`attestation.test.ts`
- `src/views/lottery/components/LotteryAttestation.tsx`（加 `FingerprintCheck` 组件）、`lottery-attestation.scss`
- `src/views/lottery/components/LotteryFairness.tsx`、`lottery-fairness.scss`、`LotteryFairness.test.tsx`
- `e2e/attestation.spec.ts`
- `README.md`（“可验证公平”一条）
- `plans/README.md`

**Out of scope**：
- 验证文件内容和格式（种子照常导出）、`fairness-package.ts` 校验逻辑、随机算法。
- “显示种子”的状态不持久化：重新打开面板又是隐藏。

## Git workflow

1. `feat: 公平性面板默认隐藏种子并醒目提示风险`
2. `feat: 导入验证文件时显示并核对指纹`

## Steps

### Step 1: 默认隐藏种子、醒目风险提示、导出提示

- “当前种子”区：默认显示“已隐藏”和按钮“显示种子”；点击后显示种子、按钮变“隐藏种子”。
- 风险提示单独成 `.fairness-warning`（`role="note"`，红色边框、加粗）：“⚠ 种子公开后，本场后续每一轮结果都可以被算出来。活动进行中不要投屏、拍照或分享种子和验证文件。”
- “已记录 N 轮抽奖。验证文件包含……”这句保留在种子区外，不随隐藏消失。
- 导出按钮旁 `.export-hint`：“验证文件含种子，活动结束后再分享”。
- 说明文字“本地验证无法证明公布时间……”保持不变。

**Verify**：组件测试：初始不出现种子数字，点“显示种子”后出现，再点隐藏；警示框存在；导出提示存在。`pnpm e2e e2e/fairness.spec.ts` 通过。

### Step 2: 导入验证文件时显示并核对指纹

`attestation.ts`：

```ts
export function normalizeFingerprint(text: string): string      // 去掉所有空白，转小写
export type FingerprintMatch = { state: 'empty' } | { state: 'match' } | { state: 'mismatch'; group: number } // group 从 1 开始
export function compareFingerprint(input: string, expected: string): FingerprintMatch
export function readPackageCommit(value: unknown): string | null // 只接受 8 或 64 位十六进制字符串
```

第一个不同分组：按 8 位一组逐组比较规范化后的输入和文件指纹，输入比文件短或长时，第一处缺失/多出的位置所在分组即为不同分组。

`LotteryFairness.tsx`：导入时把 `readPackageCommit(parsed)` 存进结果；结果区（`visibleResult.source === '导入文件'` 且有指纹）显示“文件中的指纹”（按卡片同样分组）和 `FingerprintCheck` 输入框：“与验证文件一致” / “不一致：第 k 组不同”。

**Verify**：单测覆盖空格、大小写、换行、长度不足、多出、第一个不同分组；组件测试覆盖导入后显示和一致/不一致；E2E 导入下载的验证文件，输入卡片指纹（带空格、大写）显示一致，改一位显示第 k 组不同。

## Test plan

- `attestation.test.ts`：`compareFingerprint`、`normalizeFingerprint`、`readPackageCommit`。
- `LotteryFairness.test.tsx`：种子默认隐藏、点击显示、警示与导出提示、导入后指纹核对。
- `e2e/attestation.spec.ts`：种子默认隐藏；导入验证文件后核对一致/不一致。

## Done criteria

- [ ] `pnpm type-check`、`pnpm lint` exit 0
- [ ] `pnpm exec vitest run --dir src` 全部通过；脚本 3 项通过
- [ ] `pnpm e2e e2e/attestation.spec.ts`、`pnpm e2e e2e/fairness.spec.ts` 通过
- [ ] `grep -n "本地验证无法证明公布时间" src/views/lottery/components/LotteryFairness.tsx` 有输出
- [ ] 红灯检查：逐个退回生产文件，新测试失败
- [ ] 生产构建验收截图：种子隐藏/显示两种状态、核对不一致提示
- [ ] `git diff cd58f69 -- src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-fairness.ts` 为空
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 需要改 `createVerificationPackage` 或验证文件格式。
- `e2e/fairness.spec.ts` 现有断言失败且不是选择器变化导致。

## Maintenance notes

- 计划 012（从验证文件恢复进度）会复用导入流程，`readPackageCommit` 可直接复用。
- 种子隐藏只是界面层的防误泄露，导出文件仍然含种子（决策 #5：格式不变），所以导出提示不能删。
