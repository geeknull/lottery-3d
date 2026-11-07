# Plan 012: 设计“进度备份与换机恢复”（方案与原型，不上线）

> **执行说明**：这是设计计划，产物是一份设计文档和一次性原型的结论，**不修改任何生产代码**。按步骤执行，遇到“STOP 条件”里的情况，停下来报告。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-config.ts src/views/lottery/core/lottery-fairness.ts src/views/lottery/core/fairness-package.ts src/views/lottery/core/config-restore.ts`
> 计划 003、007、008 会改这些文件。下面“现状”里的字段表以 `a9634fb` 为准；有改动时，以实际代码为准更新字段表，并在设计文档里注明。

## Status

- **Priority**: P2
- **Effort**: M（设计和原型；正式实现另算，粗估 M–L）
- **Risk**: LOW（不改生产代码）
- **Depends on**: plans/003-single-writer-progress.md、plans/007-keep-rejected-progress.md（恢复会写正式进度，必须遵守多窗口版本规则）；建议在 plans/008-salted-seed-commitment.md 之后做
- **Category**: direction
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

现在能导出配置 JSON、中奖名单 CSV 和公平验证文件，但没有任何办法把**进度**导回去。README 和兼容性文档反复提醒“不要清理站点数据或换浏览器”，说明进度只活在一个浏览器里。投影电脑在活动中途死机、浏览器数据被清，就接不上了。

验证文件已经包含种子、流水和最终状态，加上配置 JSON 就有恢复的基础。这份计划回答“能不能恢复、用什么文件、怎么防止恢复出错误结果”，让维护者决定是否实施。

## Current state

正式进度保存在 localStorage 的 `___lottery___`，由 `src/views/lottery/core/lottery-config.ts` 的 `setLocalStorage()` 写入，字段如下（`a9634fb`）：

| 存档字段 | 含义 | 验证文件里有没有 |
|---|---|---|
| `version` | 固定 2 | 不需要 |
| `hash` | `configHash(标题, 奖项规则, 名单姓名)` | 没有。验证文件不含标题，需要从配置算 |
| `currentPrize` | 当前选中奖项 | 没有，可缺省为 null |
| `prizeList[].id / countRemain / round / cardListWin` | 各奖项进度 | `finalState.prizes[]`（`winnerIds`、`countRemain`、`round`） |
| `cardListWinAll` | 全部中奖 ID | 可由各奖项 `winnerIds` 合并得到 |
| `cardListRemainAll` | 剩余奖池 ID | 可由名单减去中奖和排除得到（保持名单顺序） |
| `cardListExcluded` | 作废且不再参与 | `finalState.excludedIds` |
| `seed`、`rngState`、`seedCommit`、`drawLog` | 公平验证数据 | `seed`、`finalState.rngState`、`seedCommit`、`drawLog` |
| `revision`（计划 003 之后） | 多窗口版本 | 不需要，恢复时按规则递增 |
| `seedSalt`（计划 008 之后） | 承诺的盐 | v2 验证文件有 |

验证文件**没有**的配置信息：活动标题、头像、奖品图、揭晓节奏、头像风格。这些都在配置 JSON 里（可选择把图片打包进去）。

相关代码：

- `src/views/lottery/core/fairness-package.ts`：`verifyVerificationPackage` 可以独立复算整份文件，恢复前必须先通过它。
- `src/views/lottery/core/config-restore.ts`：`isSavedRestorable` 校验存档结构。
- `src/views/lottery/core/config-apply.ts`：配置保存的编排，有“先保存再清进度”的顺序保证，可以参考。
- 恢复只能在正式舞台进行，彩排（`?mode=rehearsal`）不能恢复。

## 要回答的问题

设计文档必须逐条回答，每条给出推荐方案和放弃的方案：

1. **备份文件形式**：A. 一个“活动备份”文件，里面放配置（含图片）和验证文件；B. 继续用两个文件，恢复时分别选择。
2. **恢复前的校验**：验证文件必须通过 `verifyVerificationPackage`；当前配置的名单 ID 顺序和奖项规则必须和文件一致（v2 文件可直接比较承诺）。不一致时怎么提示？
3. **入口和时机**：放在配置面板还是公平性面板？只允许在 `idle` 阶段、没有任何抽奖记录时恢复，还是允许覆盖已有进度（需要二次确认）？
4. **写入规则**：如何经过 `setLocalStorage()` 写入，遵守计划 003 的 `revision`，并在写入后刷新页面？
5. **与计划 007 的关系**：被拒绝的旧进度备份能不能作为恢复来源？
6. **定时备份提醒**：是否需要在每个奖项抽完后提示导出备份？

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 单测（原型用） | `pnpm exec vitest run <原型测试文件>` | 原型测试通过 |
| 确认没有遗留 | `git status --short` | 只有设计文档和 `plans/README.md` |

## Scope

**In scope**：
- `docs/superpowers/specs/<执行当天日期>-progress-restore-design.md`（新建，日期格式 `YYYY-MM-DD`）
- 一次性原型文件：只在本地分支里写，**提交前删除**
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 任何 `src/` 下的生产代码，包括新增导出函数。
- UI 改动。

## Git workflow

- 分支：`advisor/012-progress-restore-design`
- 只提交设计文档，提交信息例如 `docs: 进度备份与恢复设计`
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 核对字段表

逐一打开 `lottery-config.ts` 的 `setLocalStorage()`、`getLocalStorage()`，`lottery-fairness.ts` 的 `createVerificationPackage()`，确认上面的字段表仍然准确。如果计划 003、008 已经落地，把 `revision`、`seedSalt` 的实际行为写进去。

**Verify**：设计文档里有一张字段对照表，每一行都写明来源文件和行号。

### Step 2: 写一次性原型，验证可行性

在 `src/views/lottery/core/` 下临时新建 `progress-restore.spike.test.ts`（不提交）。参考 `lottery-config.test.ts` 的 `loadFresh` 写法：

1. 用真实模块抽几轮，包含一次作废和一次撤销，导出验证文件和当前存档。
2. 写一个原型函数，只用“验证文件 + 当前配置”重建存档对象。
3. 断言：重建的对象通过 `isSavedRestorable`；把它写进 localStorage 并重新加载模块后，`cardListWinAll`、`rngState`、`drawLog` 和原场次一致；再导出的验证文件通过 `verifyVerificationPackage`。

**Verify**：`pnpm exec vitest run src/views/lottery/core/progress-restore.spike.test.ts` → 通过。把关键代码和结论贴进设计文档的“原型结论”一节，然后删除这个文件。

### Step 3: 写设计文档

文档格式参考 `docs/superpowers/specs/2026-07-11-avatar-styles-design.md`（标题、日期、目标、现状、需求、非目标）。必须包含：

- 目标与非目标
- 字段对照表（Step 1）
- “要回答的问题”逐条的推荐方案和放弃的方案
- 原型结论（Step 2）
- 风险：恢复出错误结果、覆盖已有进度、多窗口冲突、旧版本文件
- 正式实现的拆分建议（按提交拆，每个提交的验证方式）
- 留给维护者决定的问题清单

**Verify**：`ls docs/superpowers/specs/*progress-restore-design.md` 能找到文件；`grep -c "原型结论" <该文件>` 输出不小于 1。

### Step 4: 确认没有生产代码改动

**Verify**：`git status --short` → 只有设计文档和 `plans/README.md`；`ls src/views/lottery/core/progress-restore.spike.test.ts` → 文件不存在。

## Test plan

原型测试只用于得出结论，不进入仓库。正式实现时的测试计划写在设计文档里。

## Done criteria

- [ ] 设计文档存在，包含 Step 3 列出的全部小节
- [ ] 原型测试跑通过，结论已写入文档，原型文件已删除
- [ ] `git status --short` 里没有 `src/` 的改动
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 原型证明“验证文件 + 配置”无法重建出通过 `isSavedRestorable` 的存档，而且原因不是简单的字段缺失：把失败原因写进文档后停下，不要扩大范围。
- 发现必须修改验证文件格式才能恢复：写进文档的“待决问题”，不要自己改格式。

## Maintenance notes

- 正式实现时，恢复写入必须走 `setLocalStorage()`，不能直接 `localStorage.setItem`，否则会绕过计划 003 的多窗口保护。
- 恢复属于高风险操作，正式实现要有端到端测试覆盖“换一个新浏览器上下文恢复后继续抽奖，验证仍然通过”。可以参考 `e2e/fairness.spec.ts` 里新建独立上下文的写法。
