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
pnpm lint       # 代码检查
pnpm lint:fix   # 代码检查并自动修复
```

## 部署

push 到 `main` 分支后，GitHub Actions 会自动构建并发布到 GitHub Pages（见 `.github/workflows/deploy.yml`），无需手动操作。`gh-pages` 分支是旧部署方式的历史存档，已不参与部署。

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
- **可验证公平**（🛡 按钮）：抽奖用种子化随机，开抽前公布种子指纹（承诺），结束后公布种子，任何人可用「种子 + 名单」离线复算验证，杜绝暗箱
- **抽奖历史**（🕑 按钮）：抽奖/作废/撤销全程流水带时间戳，可导出 CSV
- **离线可用**：PWA 预缓存全部资源，现场断网也能正常抽奖；抽奖进度实时存在浏览器本地，刷新/重开不丢失

## 性能与名单规模

3D 卡片墙基于 three.js CSS3DRenderer，旋转抽奖时需每帧重算所有卡片的 3D 变换。实测（桌面 Chrome）：

| 名单人数 | 旋转帧率 |
| --- | --- |
| ~300 | 流畅（>60fps） |
| 1000 | 明显掉帧（~14fps） |
| 2000 | 卡顿（~2fps） |

这是 CSS3DRenderer 的架构性瓶颈（合成层数量随卡片数线性增长），并非初始化或卡片内容渲染问题。建议名单控制在 **1000 人以内**；超过会在配置面板提示，可考虑精简或分批抽奖。

## TODO

- 背景音乐外链本地化（目前依赖网易云外链，直链已不可程序化下载，需换本地音频文件）
- 超大名单（2000+）的 3D 旋转性能：受限于 CSS3DRenderer 架构，如需支持需改用 WebGL 渲染卡片

## 参考项目

- [three.js 元素周期表例子](https://github.com/mrdoob/three.js/blob/dev/examples/css3d_periodictable.html)
- [moshang-xc 版本](https://github.com/moshang-xc/lottery)
- [星空背景](https://github.com/curran/HTML5Examples/blob/gh-pages/canvas/starfield/script.js)
