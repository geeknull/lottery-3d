# lottery-3d

基于 three.js CSS3DRenderer 的 3D 抽奖程序，纯前端实现，支持离线使用（PWA）。

## 在线链接

[https://geeknull.github.io/lottery-3d/](https://geeknull.github.io/lottery-3d/)

## 技术栈

- React 19（函数组件 + Hooks，`useSyncExternalStore` 桥接抽奖单例状态）
- Vite 8（Rolldown）+ vite-plugin-pwa（离线缓存）
- TypeScript 6（strict）
- Vitest + React Testing Library（抽奖算法、配置解析等核心逻辑有单测兜底）
- Oxlint + ESLint 混搭 lint（oxlint 快扫通用规则，ESLint 负责 react-hooks 规则）
- mitt（事件总线）
- three.js（npm 依赖，CSS3DRenderer 渲染）+ @tweenjs/tween.js

## 本地开发

要求 Node >= 22.12（推荐 24，见 `.nvmrc`）和 pnpm。

```bash
pnpm install
pnpm dev        # 开发服务器 http://localhost:8080
pnpm build      # 类型检查 + 生产构建（产物在 dist/）
pnpm preview    # 本地预览构建产物
pnpm test       # 跑单元测试（vitest）
pnpm e2e        # 核心交互 E2E，独占 127.0.0.1:18180
pnpm e2e:pwa    # 真实生产构建的离线/升级 E2E，独占 127.0.0.1:18181
pnpm lint       # 代码检查
pnpm lint:fix   # 代码检查并自动修复
```

## 部署

push 到 `main` 分支后，GitHub Actions 会在 lint、单测、构建、核心 E2E 和生产 PWA E2E 通过后发布到 GitHub Pages（见 `.github/workflows/ci.yml`）。`gh-pages` 分支是旧部署方式的历史存档，已不参与部署。

## 项目介绍

基于 `moshang-xc` 的例子主要进行了如下修改：

- 去掉了 Express 端，改成了纯前端实现
- 将代码做了合理的模块化，更方便进行二次开发
- 多 3D 对象自适应屏幕做了优化
- 2026.06：升级到 Vue 3 + Vite 8，部署切换为 GitHub Actions 自动发布；three.js/TWEEN npm 化并全量 TypeScript 化；随后整体迁移到 React 19（3D 核心与业务逻辑零改动）

## 使用

点击右上角 ⚙ 打开配置面板，可自定义活动标题、主题配色（赛博青/春节红金/极客紫）、奖项（名称/总数/每轮抽取，可增删）、抽奖名单（粘贴或从 .txt/.csv 导入），保存后即生效。配置可导出/导入 JSON 备份复用，中奖名单可导出 CSV。未配置时使用内置示例数据。

主持现场常用能力：

- **快捷键**：空格 = 开始/停止抽奖（翻页笔的 PageDown/PageUp/B/Enter 也可），F = 切换全屏（右上角也有按钮）
- **蓄力倒计时 + 音效**：开抽前 3-2-1 倒计时，旋转滴答与开奖琶音（纯合成、无音频文件），均可在配置面板关闭
- **作废 / 撤销**：「展示中奖」面板里悬停名字点 ✖ 可作废单个中奖（可选是否回奖池）；「撤销上轮」整轮重来，重抽得到新结果
- **揭晓动效**：开奖时两侧喷射彩带 + 全屏横幅展示奖项与中奖人
- **轮播展示**：待机时点「轮播展示」自动循环球体/螺旋/网格/平铺布局，任意抽奖操作自动停止
- **可验证公平**（🛡 按钮）：下载包含种子承诺、有序名单、奖项规则和完整操作流水的验证文件，可在另一设备导入复算。验证结果说明文件内部一致，仍需核对开抽前公布的指纹与名单；建议活动结束后分享文件，避免提前公开种子使后续结果可预测。
- **抽奖历史**（🕑 按钮）：抽奖/作废/撤销全程流水带时间戳，可导出 CSV
- **双屏遥控**（🖵 按钮）：从展示窗打开配对的控制窗，拖到笔记本屏后可选奖项、开始/停、看中奖名单；连上后展示窗自动隐藏操作按钮。不同展示页独立配对，刷新展示窗后需重新打开控制窗。需同一台电脑、同一浏览器、同源页面，并满足下方浏览器要求。
- **离线可用**：通过 HTTPS/localhost 首次联网加载并完成 PWA 缓存后，可断网抽奖。进度保存在当前浏览器；不要清理站点数据或切换浏览器。外链头像需要另外验证，见下方离线准备。

## 现场离线准备

1. 在实际投影电脑和浏览器里联网打开线上地址，配置名单、奖项和图片。需要自定义音乐时先上传本地音频；默认音乐和生成头像不依赖外网。
2. 等待页面资源加载完成，然后**断网并刷新**，确认标题、名单、图片正常，再试抽一轮、刷新确认进度恢复。仅打开过页面不代表缓存一定成功；正式活动前重置试抽进度。
3. 双屏使用时，断网后也打开控制窗试抽。名单中的 HTTP(S) 外链头像不在应用预缓存里，需要完全离线时使用默认生成头像或内嵌图片。
4. 导出配置和已有中奖名单作备份。浏览器隐私模式、清理站点数据或存储写入失败会影响持久化；出现保存失败提示时及时导出。
5. 现场发现新版时先选择稍后，活动结束后再更新，并重新做一次断网刷新检查。

本地使用须先安装依赖并运行 `pnpm build`，再运行 `pnpm preview --host 127.0.0.1 --port 4173 --strictPort`，用浏览器打开 `http://127.0.0.1:4173/`。保持本地服务运行，或确认 PWA 缓存完成后再断网。**不支持双击 `dist/index.html`（`file://`）启动**：浏览器会阻止 ES 模块加载，相对资源路径不能解决这个限制。

## 性能与名单规模

3D 卡片墙基于 three.js CSS3DRenderer，旋转抽奖时需每帧重算所有卡片的 3D 变换。实测（桌面 Chrome）：

| 名单人数 | 旋转帧率 |
| --- | --- |
| ~300 | 流畅（>60fps） |
| 1000 | 明显掉帧（~14fps） |
| 2000 | 卡顿（~2fps） |

这是 CSS3DRenderer 的架构性瓶颈（合成层数量随卡片数线性增长），并非初始化或卡片内容渲染问题。建议名单控制在 **1000 人以内**；超过会在配置面板提示，可考虑精简或分批抽奖。

## 浏览器兼容性

- 当前采用 Vite 8 默认构建目标：**Chrome / Edge 111+、Firefox 114+、Safari / iOS 16.4+**。这代表构建兼容性目标；自动端到端验证目前使用 Chromium，现场仍应在实际设备演练。
- 完整功能及 PWA 离线需要 **HTTPS 或 localhost**。内网普通 HTTP 下不能依赖 PWA 缓存；部分加密和剪贴板能力会降级。
- `crypto.subtle`、`crypto.randomUUID`、`BroadcastChannel` 有能力检测或降级，但这不能保证低于构建目标的浏览器能加载整个应用。`file://` 不属于支持的启动方式。

完整的兼容性矩阵、降级策略与部署建议见 [docs/compatibility.md](docs/compatibility.md)。

## TODO

- 超大名单（2000+）的 3D 旋转性能：受限于 CSS3DRenderer 架构，如需支持需改用 WebGL 渲染卡片

## 参考项目

- [three.js 元素周期表例子](https://github.com/mrdoob/three.js/blob/dev/examples/css3d_periodictable.html)
- [moshang-xc 版本](https://github.com/moshang-xc/lottery)
- [星空背景](https://github.com/curran/HTML5Examples/blob/gh-pages/canvas/starfield/script.js)
