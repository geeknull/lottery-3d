# Plan 001: 把分散的开发规则收进仓库的 AGENTS.md

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- AGENTS.md CLAUDE.md`
> 如果范围内的文件在计划写完后有改动，先对照“现状”和实际仓库；对不上就按 STOP 条件处理。

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

这个仓库主要由 AI 客户端开发，但关键规则散在仓库外的个人记忆和被 git 忽略的 `.claude/` 里。换一个客户端或一个新会话，就读不到“E2E 端口独占”“一项一提交”“验收期间不改源码”这些约束，容易占错端口、破坏公平算法的不变量或漏掉降级。把规则放进仓库后，后续每份计划和每次开发都有同一份入口。

## Current state

- 仓库根目录没有 `AGENTS.md`，也没有 `CLAUDE.md`。
- `.gitignore` 忽略 `.claude`，但不忽略 `AGENTS.md` 和 `CLAUDE.md`。
- 权威文档已经存在，AGENTS.md 只做入口和约束，不复制大段内容：
  - `README.md`：用户功能与现场准备。
  - `docs/3d-stage-upgrade.md`：控制流、场景生命周期、验证入口。
  - `docs/compatibility.md`：浏览器目标与降级。
  - `docs/performance/README.md`：性能实测。
- `package.json` 的脚本已核实：`dev`、`build`、`preview`、`test`、`test:watch`、`e2e`、`e2e:pwa`、`type-check`、`lint`、`lint:fix`。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| Lint | `pnpm lint` | exit 0 |
| 确认文件 | `test -f AGENTS.md && test -f CLAUDE.md` | exit 0 |

## Suggested executor toolkit

- 如果环境里有 `writing-for-agents` 技能，写完后用它检查一遍措辞。

## Scope

**In scope**（只能修改这些文件）：
- `AGENTS.md`（新建）
- `CLAUDE.md`（新建）
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `README.md`、`docs/**`：不要搬动或改写现有文档。
- 任何 `src/`、`e2e/`、CI 文件。

## Git workflow

- 分支：`advisor/001-agents-md`
- 提交信息用中文并带前缀，例如 `docs: 新增仓库级开发说明`
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 新建 AGENTS.md

把下面的内容原样写入仓库根目录的 `AGENTS.md`：

```markdown
# lottery-3d 开发说明

纯前端 3D 抽奖程序：React 19、TypeScript（strict）、three.js CSS3DRenderer、Vite 8、vite-plugin-pwa，部署到 GitHub Pages。

先读这些文档：`README.md`（功能与现场准备）、`docs/3d-stage-upgrade.md`（控制流与场景生命周期）、`docs/compatibility.md`（浏览器目标与降级）。

## 语言

注释、提交信息、PR 和仓库文档使用中文。提交信息带 `fix:`、`feat:`、`docs:`、`test:` 前缀。

## 命令

    pnpm dev          # 开发服务器，端口 8080
    pnpm type-check   # 类型检查
    pnpm lint         # oxlint + eslint
    pnpm test         # 单元测试
    pnpm build        # 类型检查 + 生产构建
    pnpm e2e          # 核心 E2E，约 7–8 分钟
    pnpm e2e:pwa      # 生产构建的离线与升级 E2E

单个文件：`pnpm exec vitest run <路径>`、`pnpm e2e e2e/<文件>`。

## 端口

- 8080：`pnpm dev`
- 18180：`pnpm e2e` 独占
- 18181：`pnpm e2e:pwa` 独占
- 18182：性能采样和普通预览

启动前确认端口归属。不要结束未知进程，也不要复用未知服务。

## 目录

- `src/views/lottery/core/`：业务逻辑、持久化、公平验证、双屏通信。
- `src/views/lottery/3d/`：CSS3D 场景与动画，通过 `SceneData` 注入数据，不反向 import `lottery-config`。
- `src/views/lottery/components/`：React 组件。
- `e2e/`：Playwright，`e2e/production/` 是真实生产构建的 PWA 测试。

## 必须守住的规则

抽奖流程：

- `lottery-status.ts` 的 `phase` 是唯一运行状态。本地按钮、键盘和双屏都走 `dispatchLotteryCommand`。
- 停止时先锁定阶段、抽取并保存结果，然后才开始演出。跳过和重放只使用已保存的结果，不接触随机算法。

公平验证：

- 名单顺序是算法输入，不能排序。
- 撤销不回退随机状态，被撤销的轮次保留在流水里。
- 旧配置允许小数名额，复算要沿用实际抽取循环。
- 改动算法、奖池顺序或验证文件格式前，先确认旧存档和旧验证文件仍能恢复和验证。

持久化：

- 进度只存 ID，图片和音乐存 IndexedDB，不要把图片写进 localStorage。
- 配额写入失败要提示主持人，不能静默丢结果。
- `configHash` 只包含标题、奖项规则和名单姓名。图片、头像和揭晓节奏不参与，改它们不能清进度。
- 彩排（`?mode=rehearsal`）不读写正式进度。

安全与兼容：

- 名单和奖项内容来自用户，渲染时用 `textContent` 或 React 文本，不要用 `innerHTML`。
- 内网 HTTP 不是安全上下文。`crypto.subtle`、`crypto.randomUUID`、`navigator.clipboard`、`navigator.storage`、`navigator.locks`、Service Worker 都可能不存在，使用前必须有降级。
- 导出 CSV 的单元格要经过 `escapeCsvCell`。

## 验证

- 每个改动点都要端到端验证后再提交，一项一提交，不要攒成大提交。
- 改动 UI、选择器或流程时，push 前跑 `pnpm e2e`。
- 浏览器验收期间不要改源文件，Vite HMR 会重载模块状态。
- 性能采样不要和 E2E 同时跑。
- 隐藏的浏览器窗格里 `requestAnimationFrame` 会暂停，抽奖动画不推进。这种情况用无头 Playwright 验证。
- GitHub Actions 改动只能靠一次真实 push 验证，要明确告诉用户。
- 自动 E2E 只覆盖 Chromium，Firefox、Safari 和现场设备需要人工彩排。
```

注意：代码块在上面用四个空格缩进是为了避免和本计划的代码围栏冲突，写入文件时保持四空格缩进即可。

**Verify**：`grep -c "18180" AGENTS.md` → 输出不小于 1。

### Step 2: 新建 CLAUDE.md

写入一行，让 Claude Code 也读取同一份说明：

```markdown
@AGENTS.md
```

**Verify**：`cat CLAUDE.md` → 输出 `@AGENTS.md`。

### Step 3: 确认没有动到其他文件

**Verify**：`git status --short` → 只列出 `AGENTS.md`、`CLAUDE.md`（以及 `plans/` 下的文件，如果它们还没提交）。

## Test plan

这是文档改动，没有新增测试。运行 `pnpm lint` 确认没有副作用。

## Done criteria

- [ ] `test -f AGENTS.md && test -f CLAUDE.md` 退出码为 0
- [ ] `grep -c "dispatchLotteryCommand" AGENTS.md` 输出不小于 1
- [ ] `pnpm lint` 退出码为 0
- [ ] `git status --short` 里没有 `src/`、`e2e/`、`.github/` 的改动
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- 仓库根目录已经存在 `AGENTS.md` 或 `CLAUDE.md`：不要覆盖，报告现有内容。
- `package.json` 里的脚本名和上面的命令对不上：报告差异，不要自己改写命令。

## Maintenance notes

- AGENTS.md 里的端口和命令要和 `playwright.config.ts`、`playwright.pwa.config.ts`、`package.json` 保持一致。
- 后续计划（尤其是 003、008）落地时，如果新增了不变量，要补进“必须守住的规则”。
- 不要把大段架构说明搬进这里，只留入口和约束，细节继续放在 `docs/`。
