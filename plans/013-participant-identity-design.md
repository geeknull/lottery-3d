# Plan 013: 设计“参与者身份列”（工号或部门，方案与原型，不上线）

> **执行说明**：这是设计计划，产物是一份设计文档，**不修改任何生产代码**。按步骤执行，遇到“STOP 条件”里的情况，停下来报告。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/config-store.ts src/views/lottery/core/lottery-config-users.ts src/views/lottery/core/lottery-types.ts src/views/lottery/core/lottery-history.ts`
> 计划 004、005、006 会改其中一部分。下面的“现状”以 `a9634fb` 为准；有改动时以实际代码为准，并在设计文档里注明。

## Status

- **Priority**: P3
- **Effort**: M（设计；正式实现粗估 M–L）
- **Risk**: LOW（不改生产代码）
- **Depends on**: plans/005-unique-ids.md（ID 规则先定下来）；建议在 plans/006-history-csv-escape.md 之后
- **Category**: direction
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

名单允许重名，配置面板也承诺“含重名 N 处，会自动区分”。但区分只体现在内部 ID 上（`张伟`、`张伟-2`），中奖名单 CSV、抽奖流水、喜报都只输出姓名。两个张伟中有一个中奖时，主持人没法从导出文件判断是哪一位，只能回去翻名单的行序。

大型公司年会通常有工号或部门，现在的名单解析会把这些列直接丢掉。增加一个可选的身份列，可以解决重名，也为按部门统计、领奖核对打基础。代价是配置格式、配置指纹和公平验证文件都可能要升级，所以先做设计。

## Current state

- `src/views/lottery/core/config-store.ts`：
  - `RosterEntry` 只有 `name` 和可选的 `avatar`。
  - `parseRosterEntries` 只切第一个分隔符：第二列是 `http(s)://` 或 `data:image/` 时当头像，否则整行只取名字，后面的列全部丢弃。
  - `configHash(headerTitle, prizes, roster)` 只用名字。
  - `buildWinnersCsv` 只输出 `奖项,姓名` 两列。
- `src/views/lottery/core/lottery-config-users.ts`：`buildCards` 用名字生成 ID（计划 005 之后用 `createIdAllocator`）。
- `src/views/lottery/core/lottery-types.ts`：`Card` 有 `name`、`id`、`avatar`、`index`、`row`、`col`。
- `src/views/lottery/3d/3d-card-element.ts`：卡片上的 `.details` 显示 `card.id`，名字和 ID 都用 `textContent` 渲染。
- `src/views/lottery/core/lottery-history.ts`：流水 CSV 只有 `时间,操作,奖项,姓名,备注`。
- `src/views/lottery/core/fairness-package.ts`：验证文件的名单是 `{ id, name }[]`，名单顺序是算法输入。
- 配置文件版本：`UserLotteryConfig.version` 固定为 `1`。

## 要回答的问题

设计文档必须逐条回答，每条给出推荐方案和放弃的方案：

1. **输入格式**：粘贴和 CSV 里怎么表示身份列？是否支持表头行（如 `姓名,工号,部门`）？怎样和现在的“第二列是头像链接”规则共存，并且不误吞旧名单？
2. **身份字段**：只要一个通用的“编号”，还是分成工号和部门？是否必填？
3. **ID 规则**：有工号时是否直接用工号作为卡片 ID？工号重复怎么处理？没有工号的名单必须保持现有 ID 不变。
4. **配置指纹**：身份字段是否进入 `configHash`？进入的话，只改部门会不会清空进度？
5. **公平验证**：验证文件的名单是否加入身份字段？如果计划 008 已经落地，承诺的 `commitmentContext` 是否要包含它？怎样保证旧验证文件仍能验证？
6. **展示与导出**：卡片、中奖横幅、喜报、两种 CSV 分别显示什么？
7. **兼容**：配置版本是否升到 2？旧配置和旧进度怎么读？

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 单测（原型用） | `pnpm exec vitest run <原型测试文件>` | 原型测试通过 |
| 确认没有遗留 | `git status --short` | 只有设计文档和 `plans/README.md` |

## Scope

**In scope**：
- `docs/superpowers/specs/<执行当天日期>-participant-identity-design.md`（新建）
- 一次性原型测试：只在本地写，**提交前删除**
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 任何 `src/` 下的生产代码。

## Git workflow

- 分支：`advisor/013-participant-identity-design`
- 只提交设计文档，提交信息例如 `docs: 参与者身份列设计`
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 整理现状

逐个打开“现状”里列出的文件，确认描述仍然准确，把每个受影响的函数和行号写进设计文档的“现状”一节。

**Verify**：文档的“现状”一节至少列出 6 处代码位置，每处带文件和行号。

### Step 2: 用原型验证解析规则

临时新建 `src/views/lottery/core/roster-identity.spike.test.ts`（不提交），写一个原型解析函数，覆盖：

- 旧格式：`张三`、`张三,https://a.test/a.png`、Excel 多列粘贴 `张三\t研发部`。
- 新格式：你在问题 1 里推荐的写法，包括带表头和不带表头。
- 断言旧格式的解析结果和现在的 `parseRosterEntries` 完全一致。

**Verify**：原型测试通过。把规则和结论写进文档后删除原型文件。

### Step 3: 写设计文档

格式参考 `docs/superpowers/specs/2026-07-11-avatar-styles-design.md`。必须包含：目标与非目标、现状、“要回答的问题”逐条的推荐方案和放弃的方案、原型结论、兼容与迁移方案、正式实现的拆分建议（按提交拆，每个提交的验证方式）、留给维护者决定的问题清单。

**Verify**：`ls docs/superpowers/specs/*participant-identity-design.md` 能找到文件。

### Step 4: 确认没有生产代码改动

**Verify**：`git status --short` → 只有设计文档和 `plans/README.md`；原型文件不存在。

## Test plan

原型测试只用于得出结论，不进入仓库。

## Done criteria

- [ ] 设计文档存在，包含 Step 3 列出的全部小节
- [ ] 原型证明旧名单格式的解析结果不变，结论已写入文档，原型文件已删除
- [ ] `git status --short` 里没有 `src/` 的改动
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 找不到任何一种新格式能让旧名单的解析结果保持不变：把冲突写进文档的待决问题后停下。
- 发现必须改变无身份列名单的卡片 ID：写进文档，不要继续设计依赖它的部分。

## Maintenance notes

- 名单顺序是公平算法的输入。任何“按部门分组显示”的设计都不能改变抽奖用的名单顺序。
- 身份字段进入导出文件后，要经过 `escapeCsvCell`。
