# Plan 019: 从验证文件恢复进度，奖项抽完提醒导出（设计 012）

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行。
>
> **漂移检查（先运行）**：`git diff --stat d2ca889..HEAD -- src/views/lottery/core/lottery-config.ts src/views/lottery/core/config-restore.ts src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-fairness.ts src/views/lottery/components/LotteryFairness.tsx src/views/lottery/components/Lottery.tsx src/views/lottery/components/feedback.tsx README.md docs/compatibility.md`
> 范围内文件在计划写完后有改动时，先对照“现状”；对不上按 STOP 条件处理。

## Status

- **Priority**: P2
- **Effort**: M–L
- **Risk**: MED（会写正式进度；靠“先复算、再逐项比对、写后读回、失败回滚”守住）
- **Depends on**: 003（多窗口版本）、007（旧进度留底）、008（加盐承诺）、018（验证文件名单带 `employeeId`）、设计 012
- **Category**: direction
- **Planned at**: commit `d2ca889`, 2026-11-13

## Why this matters

现在进度只活在一个浏览器的 localStorage 里。投影电脑中途死机、浏览器数据被清、要换一台机器时，已经抽出的结果接不回去，只能从头开始或手工记录。验证文件已经包含种子、整份流水和最终状态，原型证明“验证文件 + 当前配置”可以逐字段重建出原存档。这份计划把它做成主持人能用的功能：在公平性面板选一个验证文件，先独立复算、再和当前配置逐项比对，全部通过才写入，写入后刷新页面接着抽。

## Current state

设计：`docs/superpowers/specs/2026-11-13-progress-restore-design.md`。采用的答案：`plans/decisions-2026-11-13.md` 的 012 部分。设计写于 018 合入前，以下是在 `d2ca889` 上重新核对的位置：

| 位置 | 现状 |
|---|---|
| `core/lottery-config.ts:87-94` | `keepRejectedProgress(raw, reason)`：`reason` 只有 `invalid-json`、`config-mismatch`、`invalid-progress`；写入失败只 `console.warn`，不返回结果 |
| `lottery-config.ts:146-184` | `setLocalStorage()`：过期时静默不写（148 行）；写入对象在 154-174 行；`setItem` 抛错时只发一次 `storage-error`（177-183 行） |
| `lottery-config.ts:197-254` | `getLocalStorage()`：224-253 行是“把存档应用到内存”的代码，启动恢复专用 |
| `lottery-config.ts:71` | `currentHash = configHash(headerTitle, prizeConfigs, cardList)`（018 后卡片带工号） |
| `core/config-restore.ts:38-93` | `isSavedRestorable(saved, cardList, prizeList)` |
| `core/fairness-package.ts:20、33-38、76-77` | 名单条目 `{ id; name; employeeId? }`；`employeeId` 只在有工号时出现，存在时是非空字符串（018） |
| `fairness-package.ts:104-186` | `verifyVerificationPackage`：复算承诺、整份流水、最终状态；不读当前场次 |
| `core/lottery-fairness.ts:43-44` | `currentRoster`、`currentPrizes`：导出和承诺共用 |
| `core/lottery-algorithm.ts:7-13、38、77、120` | `recomputeRemain` 按名单顺序过滤；`cardListWinAll` 抽奖时追加、作废和撤销时过滤 |
| `components/LotteryFairness.tsx:106-120、163-165` | “验证文件”导入按钮，只展示结果，不改场次；`handleImport` 先 `JSON.parse` 再校验，并存 `commit`、`importId`（017，需保留） |
| `components/Lottery.tsx:42、125-127` | `useDisplaySync()` 给出 `controlConnected`；`LotteryFairness` 目前不知道控制窗是否连接 |
| `components/feedback.tsx:39-47、87-96` | `appConfirm(message, { confirmText, cancelText })`，消息是纯文本，没有警告样式 |
| `core/attestation-reminder.ts` | 公证卡提醒只存内存的写法，可参考 |

规则（`AGENTS.md`）：`phase` 是唯一运行状态；撤销不回退随机状态；进度只存 ID；配额写入失败要提示主持人；彩排不读写正式进度；名单顺序不能排序；用户内容只用 React 文本；内网 HTTP 没有 `crypto.subtle`。本计划**不改验证文件格式**、不改随机算法、不改 `phase` 状态机。

## 采用的答案（`plans/decisions-2026-11-13.md` 012）

- 【已定】恢复可以覆盖已有进度：二次确认，旧进度留底到 `___lottery_rejected___`（`reason: 'replaced-by-restore'`）。
- #1 标题不进验证文件，确认框里显示当前标题。
- #2 只在主舞台、没有控制窗连接、`phase === 'idle'` 时可用；彩排不可用。
- #3【请过目】旧进度留底失败（配额）时**阻止恢复**，提示先导出当前验证文件。与设计文档推荐相反，按决策做。
- #4 备份比当前更旧时不要求输入“替换”，用红字和专用按钮文案。
- #5 不做“从被拒绝的旧进度恢复”。
- #6 奖项抽完提醒可以忽略，并提供本场次内“不再提醒”。
- #7【请过目】不区分“恢复用”和“公开用”，提示文案写“活动结束后再分享”。

另外按设计“与计划 013 的关系”：名单比较同时比较 `employeeId`（缺省表示没有工号）。两个同名者工号互换时，文件自己的承诺仍成立，ID 和名字也相同，只有比较工号才能发现。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单测 | `pnpm exec vitest run --dir src` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/progress-restore.spec.ts` | 全部通过，独占 18180 |
| 全量 E2E | `pnpm e2e`、`pnpm e2e:pwa` | 全部通过 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `src/views/lottery/core/lottery-config.ts`、`lottery-config.test.ts`
- `src/views/lottery/core/progress-restore.ts`（新建：比对与重建）、`progress-restore.test.ts`
- `src/views/lottery/core/backup-reminder.ts`（新建：奖项抽完提醒的判定）、`backup-reminder.test.ts`
- `src/views/lottery/core/lottery-fairness.ts`（抽出下载验证文件的函数）
- `src/views/lottery/components/LotteryFairness.tsx`、`LotteryFairness.test.tsx`、`lottery-fairness.scss`
- `src/views/lottery/components/feedback.tsx`、`feedback.scss`（确认框支持一段红字警告）
- `src/views/lottery/components/Lottery.tsx`、`LotteryBackupReminder.tsx`（新建）及样式
- `e2e/progress-restore.spec.ts`（新建）
- `README.md`、`docs/compatibility.md`、`plans/README.md`、本计划

**Out of scope**：
- 验证文件格式、`version`、`commitmentContext`；随机算法；`DrawLogEntry`；`config-restore.ts` 的校验规则。
- 恢复配置本身（标题、头像、奖品图、揭晓节奏）；自动下载；云同步。
- 从被拒绝的旧进度恢复。
- 双屏控制窗里的恢复入口和提醒同步。

## Git workflow

- 分支：`claude/019-progress-restore-bf678f`（总控派发的 worktree 分支）
- 一项一提交，中文带前缀：
  1. `docs: 计划 019`
  2. `refactor: 把存档应用到内存的逻辑从 getLocalStorage 中抽出`
  3. `feat: 从验证文件和当前配置重建进度存档`
  4. `feat: 恢复进度的写入流程`
  5. `feat: 公平性面板增加从验证文件恢复进度`
  6. `test: 换新浏览器上下文恢复后继续抽奖`
  7. `feat: 奖项抽完后提醒导出验证文件`
  8. `docs: 现场准备增加备份与恢复说明`、计划状态

## Steps

### Step 1: 抽出“应用存档”和“序列化存档”

- `lottery-config.ts`：把 154-174 行的对象抽成内部 `serializeProgress(revision)`；把 224-253 行抽成内部 `applySavedProgress(saved)`。`setLocalStorage`、`getLocalStorage` 调用它们，行为不变。
- 写入抽成内部 `writeProgress(): boolean`（过期返回 false，`setItem` 抛错返回 false）；`setLocalStorage` = `writeProgress()` + 原有的一次性 `storage-error` 提示。

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config.test.ts src/views/lottery/core/identity-baseline.test.ts` 全部通过（不新增行为）；`pnpm type-check` exit 0。

### Step 2: 重建存档（纯函数）

新建 `core/progress-restore.ts`（不 import `lottery-config`，通过参数注入当前名单和奖项）：

- `compareRoster(pkgRoster, cardList)`：逐项比较 `id`、`name`、`employeeId`（缺省视为没有）和人数，返回第一处差异的中文说明（“第 N 位：备份是 X（工号 A），当前是 Y（工号 B）”/“人数不同：备份 N 人，当前 M 人”）。
- `comparePrizes(pkgPrizes, prizeList)`：逐项比较 `id`、`name`、`count`、`everyTimeGet` 和个数。
- `rebuildSavedProgress(pkg, cardList)`：按设计重放流水得到跨奖项的 `cardListWinAll` 顺序；`cardListRemainAll` 按当前名单顺序过滤中奖和排除；其他字段从 `finalState`、`seed`、`seedCommit`、`seedSalt`（只有 version 2 写）、`drawLog` 映射；`currentPrize: null`；`version: 2`。
- `planProgressRestore(raw: unknown, current)`：依次 `verifyVerificationPackage` → 名单 → 奖项 → 重建 → `isSavedRestorable`。返回 `{ ok: true, saved, summary }` 或 `{ ok: false, reason }`。`summary` 含备份的有效轮数、中奖人数、流水条数，供确认框使用。

**Verify**：`pnpm exec vitest run src/views/lottery/core/progress-restore.test.ts`：用真实模块抽几轮（含作废不再参与、撤销、跨奖项）导出，重建结果与原存档逐字段相等（除 `revision`、`hash`、`currentPrize`）；version 1（FNV）文件可重建且没有 `seedSalt` 键；基线夹具 `verification-v2.json`、`verification-v1-fnv.json` 与基线存档 `storage-v2.json` 对应（重建等于基线存档的进度字段）；篡改的文件被拒绝并显示校验器原因；名单多一人、顺序不同、改名、**工号互换**、奖项规则不同分别被拒绝且说明指出差异位置。

### Step 3: 写入流程

`lottery-config.ts` 新增 `replaceProgress(saved): { ok: true } | { ok: false; reason }`：

1. 彩排直接拒绝；`checkProgressStale()` 为真时拒绝（“其他窗口已更新进度，请关闭其他窗口后刷新页面再试”）。
2. 当前场次有流水且存储里有存档时，`keepRejectedProgress(raw, 'replaced-by-restore')` 留底；留底写入失败就拒绝（决策 #3），提示先导出当前验证文件。`keepRejectedProgress` 改为返回是否写入成功；启动路径照旧忽略返回值。
3. 记下内存快照 → `applySavedProgress(saved)` → `writeProgress()`。
4. 读回存储，确认等于 `serializeProgress(knownRevision)`；任何一步失败都把内存回滚到快照，返回原因（配额：“本地存储写入失败，进度没有改变”；被其他窗口抢先：同第 1 项）。不发 `storage-error`，由调用方提示。
5. 成功时 `notifyLotteryChange` 交给调用方（调用方随后刷新页面）。

**Verify**：`lottery-config.test.ts` 新增：空场次恢复成功，重新加载模块后进度一致且没有被拒绝；已有进度时旧存档出现在 `___lottery_rejected___`、`reason` 为 `replaced-by-restore`；留底写入抛配额错误时拒绝且存储、内存都不变；主存档写入抛错时拒绝、内存回滚、不发 `storage-error`；别的窗口先把 `revision` 改大时拒绝；彩排拒绝。

### Step 4: 公平性面板入口

- `Lottery.tsx` 把 `controlConnected` 传给 `LotteryFairness`。
- `LotteryFairness.tsx` 在“验证文件”旁加按钮“从验证文件恢复进度”。不可用时禁用并在提示里说原因：彩排（“彩排不读写正式进度”）、控制窗已连接（“请先退出双屏控制”）、不在 `idle`（“抽奖进行中，结束后再恢复”）。
- 选择文件后：`JSON.parse` 失败提示“文件不是有效的 JSON”；`planProgressRestore` 失败时在结果区红字显示原因，不弹确认。
- 通过后弹确认框：当前标题、备份的轮数和中奖人数、当前场次的轮数和中奖人数。当前没有流水：按钮“恢复并刷新”。当前有流水：红字“当前场次已有 K 轮结果，恢复后会被替换（旧进度会留底，可在配置面板导出）”；备份比当前少时再加“备份比当前场次少 J 轮，这 J 轮的结果会丢失”；按钮“替换当前进度并刷新”。
- 确认后再检查一次阶段和控制窗（确认框打开期间可能有人按了空格），然后 `replaceProgress`；成功 `location.reload()`，失败 toast 原因、不刷新。
- `feedback.tsx`：`ConfirmOptions` 加可选 `warning`（红字段落，React 文本）。
- 现有的验证结果展示、指纹核对保持不变。

**Verify**：`LotteryFairness.test.tsx` 新增：三种禁用原因；无效 JSON；校验失败显示原因且不调用写入；空场次确认文案与按钮；已有进度时红字与按钮、备份更旧的提示；确认后调用写入并刷新；写入失败 toast 且不刷新；确认期间阶段变化则不写入。`pnpm lint` exit 0。

### Step 5: E2E

`e2e/progress-restore.spec.ts`：

1. 上下文 A 抽两轮（含一次作废、一次撤销），导出验证文件和配置 JSON（默认配置时可省略配置导入）。
2. 新的独立上下文 B 打开，导入验证文件恢复：确认框是普通确认；刷新后“已记录 N 轮”、奖项计数和 A 一致；再抽一轮，“立即自验证”通过。
3. B 中已有进度时再用较旧的文件恢复：确认框出现红字和“替换当前进度并刷新”；恢复后 `___lottery_rejected___` 的 `reason` 为 `replaced-by-restore`。
4. 同一上下文开两个正式页，第一个页恢复后，第二个页的恢复被拒绝（过期）。
5. 名单不同的配置下恢复被拒绝，提示指出差异。

**Verify**：`pnpm e2e e2e/progress-restore.spec.ts` 全部通过；`--repeat-each 3` 无抖动。

### Step 6: 奖项抽完提醒

- 新建 `core/backup-reminder.ts`（纯逻辑，不 import `lottery-config`）：`createBackupReminder(initialDoneIds)`，`check(prizes)` 返回本次新抽完（`countRemain <= 0`）且没提醒过的奖项；同一奖项只提醒一次；`dismissForSession(seed)` 和 `isDismissed(seed)` 用 sessionStorage 记“本场次不再提醒”（读写包在 try/catch 里，失败退回内存）。
- 新建 `LotteryBackupReminder.tsx`：`phase` 回到 `idle` 时检查；有新抽完的奖项就在角落显示非阻塞卡片：“<奖项> 已抽完，建议导出验证文件备份。文件含种子，活动结束前请自己保管，结束后再分享”，按钮“导出验证文件”“忽略”“本场不再提醒”。启动时已经抽完的奖项不提醒；彩排和控制窗连接时不显示。
- 导出复用 `LotteryFairness` 的下载逻辑：抽成 `lottery-fairness.ts` 的 `downloadVerificationFile()`。

**Verify**：`backup-reminder.test.ts`（抽完触发一次；作废后补抽再抽完不重复；启动时已抽完不触发；不再提醒按种子生效；sessionStorage 抛错时退回内存）；组件测试（按钮行为、彩排和控制窗不显示）；`pnpm e2e e2e/progress-restore.spec.ts` 增加“抽完奖项出现提醒并能导出”。

### Step 7: 文档

- README 现场准备：每个奖项结束后导出验证文件，并保留配置 JSON；换机时先导入配置、再在公平性面板“从验证文件恢复进度”；验证文件含种子，活动结束前自己保管。
- `docs/compatibility.md`：内网 HTTP（非安全上下文）下 SHA-256 承诺无法复算，恢复会被拒绝，需要 HTTPS 或 localhost（只有 FNV 兼容承诺的文件可以）。
- `plans/README.md` 加 019 行。

**Verify**：`grep -c "恢复进度" README.md` ≥ 1；`grep -c "恢复" docs/compatibility.md` ≥ 1。

## Test plan

- 单测：见各步骤；新增 `progress-restore.test.ts`、`backup-reminder.test.ts`。
- E2E：`e2e/progress-restore.spec.ts`（Chromium）。
- 生产构建验收（`.claude/acceptance/019/`，不入库）：真实浏览器里空场次恢复、覆盖恢复（红字确认）、恢复后继续抽并自验证、两个正式窗口时被拒绝、奖项抽完提醒与导出；截图。
- 红灯检查：逐个退回生产文件，对应新测试失败。

## Done criteria

- [ ] `pnpm type-check`、`pnpm lint` exit 0
- [ ] `pnpm exec vitest run --dir src` 全部通过
- [ ] `pnpm e2e`、`pnpm e2e:pwa` 全部通过
- [ ] 红灯检查通过
- [ ] `git diff d2ca889 -- src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-rng.ts src/views/lottery/core/config-restore.ts pnpm-lock.yaml package.json` 为空
- [ ] 基线夹具（`__fixtures__/baseline-4f3b0a9/`）的验证文件能恢复出基线存档的进度
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 必须改验证文件格式、随机算法、`DrawLogEntry` 或 `config-restore.ts` 才能完成。
- 重建结果与真实存档在任何进度字段上不相等（除 `revision`、`hash`、`currentPrize`）。
- 现有 `e2e/fairness.spec.ts`、`e2e/attestation.spec.ts`、`e2e/multi-window.spec.ts` 断言失败。
- 写入流程无法保证“失败时存储和内存都不变”。

## Maintenance notes

- 恢复写入必须走 `writeProgress()`（`setLocalStorage` 的同一条路径），不能直接 `localStorage.setItem`，否则绕过多窗口版本规则。
- `___lottery_rejected___` 只保留最近一份：连续恢复两次，第一份被替换的进度会被覆盖。
- 恢复后随机状态回到备份时刻；用更旧的备份恢复后继续抽，结果取决于备份时刻的状态和之后的操作。
- 双屏显示窗口在恢复后的重连没有自动测试，列入人工彩排。
- 审查重点：`planProgressRestore` 必须在任何写入之前完成复算和比对；`replaceProgress` 任一步失败都要回滚内存。
