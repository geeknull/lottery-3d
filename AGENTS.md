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
