# 实施计划

由 improve 技能于 2026-11-07 基于提交 `a9634fb` 生成。除非依赖关系另有说明，按下表顺序执行。每个执行者：开始前完整读完计划，遵守它的 STOP 条件，完成后更新自己那一行的状态。

审计时的基线（在 `a9634fb` 上实测）：`pnpm type-check`、`pnpm lint` 通过，`pnpm test` 42 文件 416 项全部通过。本次审计没有运行 E2E。按 2026-09-30 的交接记录，CI 当时跑通了 47 项核心 E2E 和 2 项 PWA E2E。

## 执行顺序与状态

| Plan | 标题 | Priority | Effort | Depends on | Status |
|------|------|----------|--------|------------|--------|
| [001](001-agents-md.md) | 把分散的开发规则收进 AGENTS.md | P2 | S | — | DONE（分支 `advisor/001-agents-md`，`ea2c277`） |
| [002](002-avatar-white-screen.md) | 名字以 emoji 或生僻字开头时不再白屏 | P1 | S | — | DONE（分支 `advisor/002-avatar-white-screen`，`328d883`；红灯检查与生产构建验收通过） |
| [003](003-single-writer-progress.md) | 多个正式窗口不再互相覆盖抽奖进度 | P1 | M | — | DONE（分支 `advisor/003-single-writer-progress`，`376c2ab`；红灯检查与生产构建双窗口验收通过） |
| [004](004-roster-file-encoding.md) | 导入 GBK 编码的名单文件时不再乱码 | P1 | S | — | DONE（分支 `advisor/004-roster-file-encoding`，`ccc9d0c`；红灯检查与真实编码文件验收通过） |
| [005](005-unique-ids.md) | 名单和奖项的 ID 保证唯一 | P1 | S | — | DONE（分支 `advisor/005-unique-ids`，`56e2a65`；红灯检查与生产构建验收通过） |
| [006](006-history-csv-escape.md) | 抽奖流水 CSV 转义单元格内容 | P2 | S | — | DONE（分支 `advisor/006-history-csv-escape`，`5de0008`；红灯检查与生产构建导出验收通过） |
| [007](007-keep-rejected-progress.md) | 无法恢复的旧进度先备份并提醒 | P2 | S | — | DONE（分支 `advisor/007-keep-rejected-progress`，`ea51f48`；红灯检查与生产构建验收通过） |
| [008](008-salted-seed-commitment.md) | 种子承诺加盐，并绑定名单和奖项规则 | P2 | M | 005 | DONE（分支 `advisor/008-salted-seed-commitment`，`eae2572`；红灯检查与生产构建跨环境验证通过；执行中补了一处测试顺序调整） |
| [009](009-idb-commit-semantics.md) | IndexedDB 写入以事务提交为准 | P3 | S | — | DONE（分支 `advisor/009-idb-commit-semantics`，`82c8335`；红灯检查与生产构建持久化验收通过） |
| [010](010-ci-least-privilege.md) | CI 的部署权限只给部署任务 | P3 | S | — | DONE（分支 `advisor/010-ci-least-privilege`，`e24de6a`；以第二批上线的 CI 部署为准） |
| [011](011-preflight-storage-check.md) | 现场检查增加“本地存储”一项 | P3 | S | — | DONE（分支 `advisor/011-preflight-storage-check`，`f5f10ee`；红灯检查与生产构建验收通过） |
| [012](012-progress-restore-design.md) | 设计：进度备份与换机恢复 | P2 | M | 003、007（建议在 008 之后） | DONE（分支 `advisor/012-progress-restore-design`，`70e4493`；文档 `docs/superpowers/specs/2026-11-13-progress-restore-design.md`，原型 6 项通过，7 个待决问题） |
| [013](013-participant-identity-design.md) | 设计：参与者身份列 | P3 | M | 005（建议在 006 之后） | DONE（分支 `advisor/013-participant-identity-design`，`57ab1c1`；文档 `docs/superpowers/specs/2026-11-13-participant-identity-design.md`，7 个待决问题） |
| [014](014-pre-draw-attestation-design.md) | 设计：开抽前公证卡与随机状态升级 | P3 | M | 008 | DONE（分支 `advisor/014-pre-draw-attestation-design`，`0efbab7`；文档 `docs/superpowers/specs/2026-11-13-pre-draw-attestation-design.md`，9 个待决问题） |
| [015](015-pin-ci-runner.md) | CI 的 verify 任务固定在 ubuntu-24.04（2026-11-13 新增，阻塞上线） | P1 | S | — | DONE（分支 `advisor/015-pin-ci-runner`，`bd44430`；以推送后的 CI 运行为准） |
| [016](016-pre-draw-attestation-card.md) | 开抽前公证卡（浮层、打印、PNG）与开始时的一次性提醒（设计 014 路线 A） | P3 | M | 008、014 | DONE（分支 `claude/upbeat-hodgkin-77ae46`，`ef4e5d6`；红灯检查与生产构建验收通过；验收中补了一处投屏排版修正；PR #8 合并为 `4f3b0a9`，2026-11-13 已上线） |
| [017](017-fairness-panel-seed-and-fingerprint-check.md) | 公平性面板默认隐藏种子、醒目风险提示，导入验证文件时核对指纹（设计 014 路线 A） | P3 | S | 016 | DONE（分支 `claude/upbeat-hodgkin-77ae46`，`fc64629`；红灯检查与生产构建验收通过；PR #8 合并为 `4f3b0a9`，2026-11-13 已上线） |
| [018](018-participant-identity-columns.md) | 名单支持工号、部门身份列：表头解析、指纹与承诺带工号、重名后缀、CSV 身份列（设计 013） | P3 | M | 005、008、013 | DONE（分支 `claude/eloquent-dubinsky-373090`，`4f00788`；红灯检查、基线夹具回归与生产构建验收通过；执行中追加中奖名单面板的重名后缀；PR #9 合并为 `d2ca889`，2026-11-13 已上线） |
| [019](019-progress-restore-from-verification.md) | 从验证文件恢复进度（复算、逐项比对名单含工号、写后读回、失败回滚、旧进度留底），奖项抽完提醒导出（设计 012） | P2 | M–L | 003、007、008、012、018 | DONE（分支 `claude/019-progress-restore-bf678f`；红灯检查、基线夹具与生产构建验收通过；两处偏离（presenting 也算空闲、只在有流水时留底）见计划“偏离”一节；PR #10 合并为 `c20f5f9`，2026-11-13 已上线） |

状态取值：TODO | IN PROGRESS | DONE | BLOCKED（附一句原因）| REJECTED（附一句理由：已被别处修复，或方案放弃）

012–014 是设计计划，产物是 `docs/superpowers/specs/` 下的设计文档，不改生产代码。016–019 是它们的实现：016、017 实现 014 的路线 A，018 实现 013，019 实现 012；待决问题的答案见 [decisions-2026-11-13.md](decisions-2026-11-13.md)。

## 依赖说明

- **001 建议最先做**：后续计划都是自包含的，不依赖它，但它能让之后的开发少踩端口、验证和公平不变量的坑。
- **008 依赖 005**：承诺会绑定名单 ID，ID 规则必须先定下来。
- **012 依赖 003 和 007**：恢复会写入正式进度，必须遵守 003 的多窗口版本规则，并考虑 007 的备份能否作为恢复来源。
- **013 依赖 005**：身份列会影响 ID 规则，要在唯一 ID 的基础上设计。
- **014 依赖 008**：公证卡展示的是加盐并绑定名单的指纹。
- **016–019 按 016、017 → 018 → 019 的顺序串行实现并上线**：019 的名单比对要包含 018 引入的 `employeeId`（验证文件里只在有工号时出现，值为非空字符串）。

## 不能并行执行的组合

这些计划会改同一批文件，同时执行会冲突。请串行执行，或在不同工作区执行后再按顺序合并：

| 文件 | 涉及的计划 |
|---|---|
| `src/views/lottery/core/lottery-config.ts` | 003、005、007、008、018、019 |
| `e2e/reliability.spec.ts` | 002、004、005、007 |
| `src/views/lottery/components/LotteryConfigPanel.tsx` | 004、007、018 |
| `src/views/lottery/core/config-store.ts` | 004、007、018 |
| `src/views/lottery/components/Lottery.tsx` | 003、007 |
| `README.md` | 003、008、011、016、018、019 |
| `src/views/lottery/components/LotteryFairness.tsx` | 016、017、019 |

006、009、010 和其他计划没有文件重叠，可以随时并行。

## 推迟的事项

- **升级 Playwright**（2026-11-13 新增）：`ubuntu-latest` 已切到 26.04，`@playwright/test` 1.60 不支持。计划 015 先固定 `ubuntu-24.04` 恢复 CI；升级到支持新镜像的版本（当时最新 1.65）要改 lockfile 和浏览器版本，并重跑全量 E2E 与 PWA E2E，应在 GitHub 下线 24.04 镜像前完成。

- **随机状态只有 32 位**（计划 008 之后仍然存在）：前几轮中奖结果公开后，理论上可以反推随机状态并预测后续轮次。014 设计评估过升级方案（路线 B，`sha256-ctr-v1`），维护者 2026-11-13 决定不做，改为计划 017 的缓解：面板默认隐藏种子、醒目提示“种子公开后后续结果可预测”、导出旁提示活动结束后再分享。
- **抽奖流水的 `poolIds` 存储增长**：每轮都保存完整奖池 ID。实测估算 3000 人 300 轮约 790 万字符，超过 localStorage 常见的约 5M 字符上限；1000 人 100 轮只有约 85 万字符。正常规模用不到，计划 011 会在接近上限时提前提醒。真有超大活动时再考虑压缩存储。

### 016–019 上线后留下的后续事项（2026-11-13）

- **双屏时公证卡提醒只出现在投影窗**（PR #8）：第一次开始时的“还没展示公证卡”提示是展示窗的 toast，不同步到控制窗，主持人看不到、观众可能看到。要同步需要改双屏协议。
- **只有部门、没有工号的重名者在台上难以区分**（PR #9）：卡片 `.details` 按设计在没有工号时显示 ID（如 `陈静-2`），部门只在悬停提示里；揭晓横幅的人名是视觉隐藏的读屏文本。可考虑没有工号时卡片显示部门。
- **历史时间线面板（🕑）没有重名后缀**（PR #9）：它的 CSV 导出已带身份列，面板本身仍只显示姓名。
- **内网 HTTP 下的下载**（PR #10）：无头 Chromium 在非安全 HTTP 源上不触发下载事件（原有下载逻辑同样如此）。需要在真实 Chrome 的内网 HTTP 环境确认“下载验证文件”和奖项抽完提醒里的下载是否被拦截。
- **恢复时内存有结果、存储却为空**（总控审查 PR #10 时发现）：`replaceProgress` 只在存储里有旧存档且有流水时留底。如果之前的写入一直失败（存储为空），内存里未落盘的结果在确认框红字提示后会被替换，没有留底。场景很窄（此前已有 `storage-error` 提示），暂不处理。
- **需要人工彩排**：Firefox、Safari 的公证卡浮层、打印预览和 PNG 字体；投影的字号和对比度；双屏下恢复进度后再打开控制窗、显示窗口重连。

## 考虑过但不做的事项

- **拆分 532 KB 主包**：单页离线工具，主包在 PWA 预缓存范围内，PWA 离线 E2E 已经覆盖，收益很小。
- **WebGL 第二套渲染器**：README 已决定以现场设备实测为准再评估，不默认增加第二套渲染器。
- **跨设备遥控（手机或另一台电脑）**：`docs/superpowers/specs/2026-06-13-dual-screen-design.md` 已明确排除，需要后端。
- **XSS**：名字和 ID 都用 `textContent` 或 React 文本渲染，审计没有发现危险的 HTML 写入点。
- **E2E 文件纳入类型检查**：实测只有 14 个缺少 `@types/node` 的报错和 2 个隐式 any，价值低。
- **依赖告警**：`pnpm audit` 共 76 条（37 条高危），高危全部在开发和构建依赖链上（jsdom、eslint、vite、sass、workbox-build）。生产依赖只有 1 条中危，来自 `@dicebear/initials`，而应用只导入了 `funEmoji` 和 `bottts`。下次顺手做一次范围内升级即可，不需要单独立项。
- **死代码清理**（`verifyDrawLog`、`replaySequence`、`getUserById`、`lotteryStart`、`lotteryStop` 等只剩测试或兼容引用的导出）：收益小，而且 `verifyDrawLog` 有一组单测，删除时要同步处理。以后改到这些文件时顺手清理。
- **`recomputeRemain` 的嵌套查找**：O(n·m)，3000 人时每轮仍在毫秒级，不是瓶颈。
- **双屏心跳在后台标签页被节流**：Chrome 对隐藏超过 5 分钟的页面会降低定时器频率，可能让控制窗显示断开。没有复现，属于推测，暂不立项。

## 本次审计没有覆盖

- `src/views/lottery/3d/3d-calc-distance.ts`、`3d-winner-layout.ts` 没有逐行审阅。
- 音乐、彩带、星空、倒计时组件的细节和样式文件没有审阅。
- Firefox、Safari 和真实投影设备没有测试；“中文 Windows 的 Excel 默认保存为 GBK”没有在真实 Excel 上验证。
- 计划 009 描述的“事务在提交阶段中止”是读代码得出的结论，没有在真实浏览器复现。
