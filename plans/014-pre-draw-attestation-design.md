# Plan 014: 设计“开抽前公证卡”，并评估随机状态升级（方案，不上线）

> **执行说明**：这是设计计划，产物是一份设计文档，**不修改任何生产代码**。按步骤执行，遇到“STOP 条件”里的情况，停下来报告。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-rng.ts src/views/lottery/core/fairness-package.ts src/views/lottery/core/lottery-fairness.ts src/views/lottery/components/LotteryFairness.tsx src/views/lottery/core/poster.ts`
> 本计划依赖计划 008 的改动，这些文件预期已经变化。以实际代码为准。

## Status

- **Priority**: P3
- **Effort**: M（设计；正式实现粗估 M）
- **Risk**: LOW（不改生产代码）
- **Depends on**: plans/008-salted-seed-commitment.md（必须先完成）
- **Category**: direction
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

公平性面板要求主持人“在开抽前记录并公布”承诺指纹，但界面只显示一串 64 位十六进制，怎么公布、公布到哪里全靠手工复制。计划 008 之后，这个指纹已经覆盖名单顺序和奖项规则，值得做成一张可以投屏、拍照或打印的“公证卡”，让到场的人在开抽前就留下凭证。

另外，计划 008 只堵住了“从指纹反推种子”这条路。随机状态仍是 32 位，前几轮中奖人公开后，理论上可以穷举反推出随机状态，预测后续轮次。这份设计要评估是否值得升级随机算法。

## Current state

- `src/views/lottery/components/LotteryFairness.tsx`：显示承诺指纹和当前种子，提供自验证、复制、下载和导入验证。
- `src/views/lottery/core/poster.ts`：用 canvas 画纯文字喜报并导出 PNG，注释说明不画外链头像是为了避免 canvas 被污染。公证卡可以复用这个思路，不引入新依赖。
- 计划 008 之后：`seedSalt`、`commitmentContext(roster, prizes)`、验证文件 `version: 2`、`commitmentAlgorithm: 'sha256-salted'`。
- `src/views/lottery/core/lottery-rng.ts`：`mulberry32`，状态是一个 uint32；验证文件写死 `algorithm: 'mulberry32-v1'`，`rngState`、`rngStateBefore` 都按 uint32 校验。
- 离线是硬约束：PWA 要能断网使用，所以不能依赖在线随机信标或在线时间戳服务。
- 二维码需要新依赖或自写编码器，目前项目没有。

## 要回答的问题

设计文档必须逐条回答，每条给出推荐方案和放弃的方案：

**公证卡**

1. 卡片内容：指纹、名单人数、奖项规则摘要、生成时间、验证方法说明？指纹怎么分组显示才便于人工核对？
2. 形式：投屏全屏卡片、PNG 下载、打印样式？是否需要二维码？如果需要，引入哪个库、体积多少（用 Context7 或官方文档查当前版本，不要凭记忆）？
3. 时机：只在第一轮抽奖前允许生成？已经有抽奖记录时怎么提示？
4. 验证方：拿到卡片的人之后如何核对（导入验证文件后面板显示同一个指纹）？

**外部随机性**

5. 是否允许现场观众提供一段随机输入，混入种子？在离线前提下怎么设计，怎么写进验证文件？

**随机状态升级**

6. 32 位状态的实际风险：活动中途反推需要哪些公开信息、多少计算量？用量级估算即可，**不要写可运行的攻击代码**。
7. 升级方案：更大的状态（例如 128 位），或用 SHA-256 按“种子 + 轮次”派生随机数。新算法标识怎么命名，`rngState`、`rngStateBefore` 的格式怎么变？
8. 兼容：`mulberry32-v1` 的存档和验证文件必须继续能恢复和验证，升级只对新场次生效。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 确认依赖已完成 | `grep -n "sha256-salted" src/views/lottery/core/fairness-package.ts` | 有输出 |
| 确认没有遗留 | `git status --short` | 只有设计文档和 `plans/README.md` |

## Scope

**In scope**：
- `docs/superpowers/specs/<执行当天日期>-pre-draw-attestation-design.md`（新建）
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 任何 `src/` 下的生产代码。
- 安装新依赖：只做调研，写进文档。

## Git workflow

- 分支：`advisor/014-pre-draw-attestation-design`
- 只提交设计文档，提交信息例如 `docs: 开抽前公证卡与随机状态升级设计`
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 确认前置条件

**Verify**：`grep -n "sha256-salted" src/views/lottery/core/fairness-package.ts` → 有输出。没有输出就按 STOP 条件处理。

### Step 2: 调研

- 读 `LotteryFairness.tsx`、`poster.ts`、`lottery-rng.ts`、`fairness-package.ts`，记录相关函数和行号。
- 如果推荐二维码，查一个维护中的二维码库的当前版本、体积和许可证，写明来源。
- 随机状态风险只做量级估算，引用计划 008 记录的实测数据：本机单线程每秒约 152 万次 SHA-256（仅作量级参考）。

**Verify**：文档里每条外部事实都写明来源（官方文档链接或命令输出）。

### Step 3: 写设计文档

格式参考 `docs/superpowers/specs/2026-07-11-avatar-styles-design.md`。必须包含：目标与非目标、现状（带行号）、“要回答的问题”逐条的推荐方案和放弃的方案、风险、正式实现的拆分建议（公证卡和随机算法升级分成两条独立路线）、留给维护者决定的问题清单。

**Verify**：`ls docs/superpowers/specs/*pre-draw-attestation-design.md` 能找到文件。

### Step 4: 确认没有生产代码改动

**Verify**：`git status --short` → 只有设计文档和 `plans/README.md`。

## Test plan

设计计划，没有测试。正式实现的测试计划写在设计文档里。

## Done criteria

- [ ] 设计文档存在，包含 Step 3 列出的全部小节
- [ ] 文档没有可运行的攻击代码
- [ ] `git status --short` 里没有 `src/` 或 `package.json` 的改动
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 计划 008 还没完成。
- 发现公证卡需要在线服务才能成立：写进文档，不要继续设计在线方案。

## Maintenance notes

- 公证卡只是让“开抽前公布”这一步更容易做，不能证明公布时间。面板里“本地验证无法证明公布时间”这句提醒要保留。
- 随机算法升级会改变验证文件格式，必须单独立项、单独评审。
