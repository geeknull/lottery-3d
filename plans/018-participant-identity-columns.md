# Plan 018: 名单支持工号、部门身份列（设计 013）

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行。
>
> **漂移检查（先运行）**：`git diff --stat 4f3b0a9..HEAD -- src/views/lottery/core/config-store.ts src/views/lottery/core/config-apply.ts src/views/lottery/core/lottery-config.ts src/views/lottery/core/lottery-config-users.ts src/views/lottery/core/lottery-types.ts src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-fairness.ts src/views/lottery/core/lottery-history.ts src/views/lottery/core/lottery-snapshot.ts src/views/lottery/core/poster.ts src/views/lottery/3d/3d-card-element.ts src/views/lottery/components/LotteryConfigPanel.tsx src/views/lottery/components/LotteryWinBanner.tsx src/views/lottery/components/LotteryControl.tsx src/views/lottery/components/LotteryHistory.tsx src/views/lottery/components/useDisplaySync.ts README.md`
> 范围内文件在计划写完后有改动时，先对照“现状”；对不上按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED（动配置指纹、承诺上下文和验证文件；靠基线夹具守住旧存档与旧验证文件）
- **Depends on**: 005（唯一 ID）、008（加盐承诺）、设计 013；与 016、017 无冲突
- **Category**: direction
- **Planned at**: commit `4f3b0a9`, 2026-11-13

## Why this matters

名单只有姓名时，两个“张伟”中一个中奖，现场和导出文件都看不出是哪一位；同名者互换顺序，现有配置指纹（只含姓名）也检测不到。加上可选的工号、部门两列后，揭晓、喜报和导出能分清是谁，工号进入配置指纹和承诺，赛后可以证明“A001 当时就是第一个张伟”。没有身份列的名单必须完全不受影响。

## Current state

设计：`docs/superpowers/specs/2026-11-13-participant-identity-design.md`。采用的答案：`plans/decisions-2026-11-13.md` 的 013 部分。设计写于 008 合入前，以下是在 `4f3b0a9` 上重新核对的位置（与设计表的差异已标出）：

| 位置 | 现状 |
|---|---|
| `core/config-store.ts:18-21` | `RosterEntry { name; avatar? }` |
| `config-store.ts:37-66` | `isValidConfig`：名单对象只查 `name`、`avatar` |
| `config-store.ts:102` | `AVATAR_PATTERN = /^(https?:\/\/|data:image\/)/` |
| `config-store.ts:119-133` | `parseRosterEntries`：只切第一个分隔符（`,` Tab `，`），第二列不是头像就丢 |
| `config-store.ts:146-150` | `rosterEntriesToText`：`名字,头像` 或 `名字` |
| `config-store.ts:154-163` | `configHash(headerTitle, prizes, roster)`：已经接收条目数组，哈希 `{ headerTitle, prizes, rosterNames }` |
| `config-store.ts:193-201` | `buildWinnersCsv(prizeList)`：表头 `奖项,姓名`，BOM |
| `core/lottery-config-users.ts:11-46` | `Person { name; avatar? }`；`buildCards` 用 `createIdAllocator` 按名字生成 ID |
| `core/lottery-types.ts:4-12` | `Card` 无身份字段；`DrawLogEntry` 存 `winnerNames`、`winnerIds` |
| `core/lottery-config.ts:71`（设计写 70） | `configHash(headerTitle, prizeConfigs, cardList.map(c => c.name))` |
| `core/config-apply.ts:41` | `roster.map(entry => entry.avatar ? entry : entry.name)` |
| `config-apply.ts:69、89、93` | 三处 `configHash`；69、89 传 `config.roster`（条目），93 传 `cardList.map(card => card.name)` |
| `core/fairness-package.ts:20、31-36、78-79` | 名单 `{ id; name }[]`；**008 已合入**：`commitmentContext` 名单条目是 `[id, name]`；校验器只查 `id`、`name` 是字符串 |
| `core/lottery-fairness.ts:42`（设计写 66） | `currentRoster = () => cardList.map(({ id, name }) => ({ id, name }))`，承诺和导出共用 |
| `core/lottery-history.ts:51-60` | `historyToCsv(drawLog)`：表头 `时间,操作,奖项,姓名,备注` |
| `core/lottery-snapshot.ts:18、35` | 控制窗快照 `lastReveal { prizeName; winnerNames }` |
| `3d/3d-card-element.ts:31-35` | `.details` 用 `textContent` 显示 `card.id` |
| `components/LotteryControl.tsx:91` | 控制窗“最近中奖”`winnerNames.join('、')` |
| `components/LotteryWinBanner.tsx:28` | 揭晓横幅 `w.name` |
| `core/poster.ts:94` | 喜报 `fillText(c.name, …)` |
| `components/LotteryConfigPanel.tsx:60-62、65-66、333-338、356-358` | 清空进度确认（固定文案）；重名计数；名单提示；“本次保存将清空…”提示 |

已有测试 `config-store.test.ts:42` 断言 `张三,研发部` 只解析出名字，必须保留。

规则（`AGENTS.md`）：名单顺序是算法输入不能排序；`configHash` 只含标题、奖项规则、名单姓名（本计划按设计加工号）；用户内容只用 `textContent` 或 React 文本；CSV 单元格过 `escapeCsvCell`。

### 基线夹具

动手前已用 `4f3b0a9` 的生产构建导出夹具，放在 `src/views/lottery/core/__fixtures__/baseline-4f3b0a9/`（脚本 `.claude/acceptance/018/baseline-export.mjs`，不入库）：

- `storage-v2.json`：带进度的 `___lottery___` 和 `___lottery_config___`（10 人含两个张伟、`=SUM(1)`、`+王五`、一个 data URL 头像；抽 3 轮、撤销 1 轮）。
- `verification-v2.json`（加盐 SHA-256）、`verification-v1-fnv.json`（无 `crypto.subtle` 时的 FNV）、`verification-v1-sha256.json`（008 之前的无盐旧存档）。
- `winners.csv`、`history.csv`：同一状态下两种 CSV 的原始字节（时区 Asia/Shanghai）。

## 采用的答案（`plans/decisions-2026-11-13.md` 013）

1. 【已定】修正工号会改变指纹并触发清空确认；确认框写清会清空什么、为什么是工号导致的。
2. 重复工号只黄字警告“工号 X 重复 N 处”，不阻止保存。
3. 【请过目】不支持带双引号的 CSV。
4. README 现场准备加一句新旧版本混用会丢身份列。
5. 表头中英文都认：`姓名`/`名字`/`name`；`工号`/`编号`/`employee_id`；`部门`/`department`；`头像`/`avatar`。英文不分大小写。
   **`avatar` 也认**，理由：`头像` 本来就是已知列名，只认中文会让英文表头 `name,employee_id,avatar` 的头像列被当成未知列丢掉，和“中英文同时支持”不一致；风险与其他关键字相同（首行恰好是 `name,avatar` 的旧粘贴文本会被当作表头），而已保存的配置是 JSON，回填面板时不会生成这种首行，不影响已有配置。
6. 重名后缀优先工号，没有工号用部门，只对重名者加。
7. 验证文件只放工号。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单测 | `pnpm exec vitest run --dir src` | 全部通过 |
| 脚本单测 | `pnpm exec vitest run scripts/gen-release-notes.test.mjs` | 3 项通过 |
| 单文件 E2E | `pnpm e2e e2e/identity.spec.ts` | 全部通过，独占 18180 |
| 全量 E2E | `pnpm e2e`、`pnpm e2e:pwa` | 全部通过 |
| 构建 | `pnpm build` | exit 0 |

## Scope

**In scope**：
- `src/views/lottery/core/config-store.ts`、`config-store.test.ts`、`roster-identity.test.ts`（新建，名单解析与提示）
- `src/views/lottery/core/lottery-types.ts`、`lottery-config-users.ts`、`lottery-config-users.test.ts`
- `src/views/lottery/core/config-apply.ts`、`config-apply.test.ts`
- `src/views/lottery/core/lottery-config.ts`（只改指纹调用一行）
- `src/views/lottery/core/participant-identity.ts`（新建：重名后缀、身份查表）、`participant-identity.test.ts`
- `src/views/lottery/core/fairness-package.ts`、`lottery-fairness.ts`、`lottery-fairness.test.ts`
- `src/views/lottery/core/lottery-history.ts`、`lottery-history.test.ts`
- `src/views/lottery/core/lottery-snapshot.ts`、`lottery-snapshot.test.ts`
- `src/views/lottery/core/poster.ts`、`poster.test.ts`（新建）
- `src/views/lottery/core/identity-baseline.test.ts`（新建，基线夹具回归）、`__fixtures__/baseline-4f3b0a9/*`
- `src/views/lottery/3d/3d-card-element.ts`、`3d-card-element.test.ts`
- `src/views/lottery/components/LotteryWinBanner.tsx`、`LotteryWinBanner.test.tsx`、`LotteryControl.tsx`、`LotteryHistory.tsx`、`useDisplaySync.ts`、`LotteryConfigPanel.tsx`、`lottery-config-panel.scss`
- `e2e/identity.spec.ts`（新建）
- `README.md`、`plans/README.md`、本计划

**Out of scope**：
- 随机算法（`lottery-rng.ts`）、抽奖流程、`phase`、验证文件 `version`、配置 `version`、`DrawLogEntry` 结构、`config-restore.ts`。
- 按部门分组/统计/限定奖池；带引号 CSV；新增依赖。
- 卡片 ID 规则（仍由名字生成）。
- 公证卡文案（`attestation.ts` 已写“含工号（如有）”）。
- 历史时间线面板的显示（只改它的 CSV 导出入参）。

## Git workflow

- 分支：`claude/eloquent-dubinsky-373090`（总控派发的 worktree 分支）
- 一项一提交，中文带前缀：
  1. `feat: 名单解析支持带表头的工号和部门列`
  2. `feat: 配置保存保留身份字段并校验`
  3. `feat: 工号进入配置指纹`
  4. `feat: 卡片、揭晓名单和喜报显示身份`
  5. `feat: 导出 CSV 增加工号和部门列`
  6. `feat: 验证文件名单带工号`
  7. `feat: 配置面板提示身份列用法`
  8. `docs: README 说明身份列`、计划状态

## Steps

### Step 1: 名单解析支持表头模式

- `RosterEntry`、`Person`、`Card` 加 `employeeId?: string`、`department?: string`。
- `config-store.ts`：现有 `parseRosterEntries` 的实现改名为内部 `parseLegacyRoster`，原样保留。新的 `parseRosterEntries(text)`：
  1. 找首个非空行，按 `/[,\t，]/` 切格并 `trim()`（`trim` 会去掉 BOM）。第一格小写后属于 `姓名/名字/name`，且后面至少一格属于已知列名，才进入表头模式；否则 `return parseLegacyRoster(text)`。
  2. 表头模式：列按表头位置对应，未知列忽略；`工号/编号/employee_id`→`employeeId`，`部门/department`→`department`，`头像/avatar`→`avatar`。头像是最后一列时取该列起的整段原文（data URL 含逗号），不是最后一列时只取单格；头像值不符合 `AVATAR_PATTERN` 就丢。空值不写入键；行比表头短按空处理；姓名为空的行丢弃。
- `rosterEntriesToText`：没有任何条目带工号或部门时与现在逐字节相同；有时首行输出 `姓名,工号,部门`（有头像再加 `,头像`），每行按列输出。
- 新增 `rosterTextHints(text)`：返回 `{ headerMode, ignoredColumns, duplicateEmployeeIds: { id, count }[] }`。`ignoredColumns` 只在非表头模式下、某行第一个分隔符后还有非头像内容时为真；重复工号按首次出现顺序列出（不排序名单）。

**Verify**：`pnpm exec vitest run src/views/lottery/core/config-store.test.ts` → 旧格式 9 种输入与基线结果 `toEqual` 且无身份键；表头模式（中文、英文大小写、制表符、全角逗号、BOM、未知列、行比表头短、头像在最后且 data URL 含逗号）；往返；提示函数，全部通过。

### Step 2: 配置保存保留身份字段并校验

- `config-apply.ts:41` 改为：有 `avatar`、`employeeId`、`department` 任一项就保留对象，否则只存名字。
- `isValidConfig` 名单对象补 `employeeId`、`department` 缺省或为字符串。
- `buildCards`：有非空工号/部门才写进 `Card`（空串当作没有），ID 仍由 `createIdAllocator(name)` 生成。

**Verify**：`config-apply.test.ts`（身份字段保存、导出 JSON 再 `parseConfigJson` 不丢，纯名字仍存字符串）、`config-store.test.ts`（`employeeId: 1` 被拒）、`lottery-config-users.test.ts`（两个张伟带不同工号时 ID 仍是 `张伟`、`张伟-2`，无身份时卡片没有身份键）通过；`pnpm type-check` exit 0。

### Step 3: 工号进入配置指纹

- `configHash`：`rosterEmployeeIds = entries.map(e => e.employeeId ?? '')`，至少一个非空时才在 JSON 里追加 `rosterEmployeeIds`，否则哈希输入与现在完全一致。部门不进。
- 调用处：`lottery-config.ts:71` 改传 `cardList`；`config-apply.ts:93` 改传 `cardList`；`config-apply.ts:69、89` 已传 `config.roster`，不用改。
- `identity-baseline.test.ts`：把 `storage-v2.json` 写进 localStorage，重新加载 `lottery-config`，断言进度恢复（`takeRejectedNotice()` 为 false、流水 4 条、中奖 4 人）且没有备份被写入；`configHash(夹具配置)` 等于存档里的 `hash`（基线固定值 `42ace6cc`）。

**Verify**：单测：无工号时指纹等于基线固定值；只加部门不变；有工号时改部门不变；互换两个张伟的工号会变；旧存档照常恢复。

### Step 4: 卡片、揭晓名单和喜报显示身份

- 新建 `core/participant-identity.ts`（不 import `lottery-config`）：`createWinnerLabeler(cardList)` 返回 `(card) => string`：只有名单里重名的人才加 `（工号）`，没有工号用部门，都没有只显示姓名；`identityById(cardList)`。
- `3d-card-element.ts`：`.details` 有工号显示工号，否则显示 ID；`title` 附部门；全部 `textContent`/属性赋值。
- `LotteryWinBanner.tsx`：`w.name` 改为 labeler 结果（React 文本）。
- `lottery-snapshot.ts`：`SnapshotSource` 可选带 `cardList`；有时 `lastReveal.winnerLabels` 按 `winnerIds` 生成；`LotteryControl.tsx` 优先显示 `winnerLabels`。`useDisplaySync` 已传整个 `lotteryConfig`，无需改。
- `poster.ts`：网格单元格用 labeler 结果。

**Verify**：`participant-identity.test.ts`、`3d-card-element.test.ts`、`LotteryWinBanner.test.tsx`、`lottery-snapshot.test.ts`、`poster.test.ts`（假 2D context 记录 `fillText`）通过；`pnpm e2e e2e/identity.spec.ts` 的“后缀只出现在重名者上”通过。

### Step 5: 导出 CSV 增加工号和部门列

- `buildWinnersCsv(prizeList, roster?)`：`roster` 里有任何工号或部门时表头 `奖项,姓名,工号,部门`，否则保持 `奖项,姓名`。面板调用传 `lotteryConfig.cardList`。
- `historyToCsv(drawLog, roster?)`：有身份时末尾追加 `工号,部门`，按 `winnerIds[i]` 查当前卡片；查不到留空。`LotteryHistory.tsx` 传 `lotteryConfig.cardList`。
- 新单元格都过 `escapeCsvCell`。

**Verify**：`config-store.test.ts`、`lottery-history.test.ts`：无身份时与现有断言相同；有身份时加列；工号 `=1+1`、`+A01` 被中和。`identity-baseline.test.ts`：基线状态下两种 CSV 与 `winners.csv`、`history.csv` 逐字节相同。

### Step 6: 验证文件名单带工号

- `VerificationPackage.roster` 改为 `{ id; name; employeeId?: string }[]`。
- `commitmentContext`：条目有 `employeeId` 时 `[id, name, employeeId]`，否则 `[id, name]`。
- 校验器：`employeeId` 缺省或为非空字符串。
- `lottery-fairness.ts` 的 `currentRoster`：有工号才写 `employeeId` 键。

**Verify**：`lottery-fairness.test.ts`：无工号时上下文与 `[id, name]` 写法相同；有工号时变化；三份基线验证文件通过 `verifyVerificationPackage`；基线状态下 `createVerificationPackage()` 与 `verification-v2.json` 逐字节相同；带工号的真实场次导出通过，篡改工号失败，`employeeId: 1` 和 `''` 判为格式无效。

### Step 7: 配置面板提示身份列用法

- 名单提示改写：说明表头写法（中英文关键字、头像列放最后、不支持带引号 CSV）。
- 黄字：`工号 X 重复 N 处`（每个重复工号一行，可保存）；`检测到多列内容但没有表头，附加列被忽略；首行加上「姓名,部门」可启用`。
- 重名提示：有身份列时“揭晓时重名者附工号（无工号附部门）”，否则“会自动区分；加上工号列可在揭晓和导出时分清”。
- 清空确认：`config-apply.ts` 新增 `describeProgressReset(config)`，逐项比较标题、奖项规则、名单姓名与顺序、工号，返回原因列表；`resetConfirmMessage(config)` 写明会清空的内容（已抽中奖人数、流水条数、随机种子与开抽前指纹作废）和原因，工号原因写“工号有改动：工号参与配置指纹，用来区分同名的人；工号变了，已保存的中奖记录无法确认对应的是谁”。`makeConfigApplication` 的确认回调接收当前配置。“本次保存将清空…”提示后附原因。

**Verify**：`config-apply.test.ts`（只改工号时原因只有工号一条；改部门不触发）通过；`pnpm e2e e2e/identity.spec.ts` 的“修改工号触发清空确认且文案写清后果”通过。

### Step 8: 文档

- README：配置一节写身份列用法；现场准备加“新旧版本混用（旧版本打开新配置再导出）会丢身份列”。
- `plans/README.md` 加 018 行。

**Verify**：`grep -c "工号" README.md` ≥ 2。

## Test plan

- 单测：见各步骤 Verify；新增 `participant-identity.test.ts`、`poster.test.ts`、`identity-baseline.test.ts`。
- E2E `e2e/identity.spec.ts`（Chromium）：两个张伟带不同工号，后缀只在重名者上（横幅、卡片工号）；导出中奖 CSV 含工号部门列；修改工号触发清空确认、文案写清后果。
- 生产构建验收（`.claude/acceptance/018/`）：面板提示（重复工号、多列无表头）、卡片工号、横幅后缀、喜报后缀、清空确认框、CSV 内容；基线构建抽几轮后换新构建，旧进度照常恢复。

## Done criteria

- [ ] `pnpm type-check`、`pnpm lint` exit 0
- [ ] `pnpm exec vitest run --dir src` 全部通过；脚本 3 项通过
- [ ] `pnpm e2e`、`pnpm e2e:pwa` 全部通过
- [ ] 红灯检查：逐个退回生产文件，新测试失败
- [ ] `git diff 4f3b0a9 -- src/views/lottery/core/lottery-rng.ts src/views/lottery/core/config-restore.ts pnpm-lock.yaml package.json` 为空
- [ ] 基线夹具回归通过（旧存档恢复、三份旧验证文件通过、两种 CSV 与验证文件逐字节相同）
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 任一基线夹具在新代码下恢复失败、验证失败或输出字节不同。
- 必须改随机算法、`DrawLogEntry`、`config-restore.ts`、验证文件或配置 `version` 才能完成。
- 9 种旧格式输入中任何一种解析结果变化。
- 现有 `e2e/fairness.spec.ts`、`e2e/attestation.spec.ts` 断言失败。

## Maintenance notes

- 计划 012（从验证文件恢复进度）会逐项比较验证文件名单的 `id`、`name`、`employeeId`：`employeeId` 只在有工号时出现，缺省表示没有工号，存在时是非空字符串。
- 表头模式下所有分隔符都切格，不支持引号；部门名含逗号会被切开。从 JSON 导入的配置若身份值本身含分隔符，回填面板再保存会被切开（与现在名字含逗号的行为相同）。
- 历史时间线面板仍只显示姓名，没有加后缀；需要时用 `createWinnerLabeler`。
- 审查重点：`configHash` 无工号分支与原实现的输入字符串完全相同；`commitmentContext` 无工号分支同理。
