# lottery-3d

基于 three.js CSS3DRenderer 的 3D 抽奖程序，纯前端实现。

## 在线链接

[https://geeknull.github.io/lottery-3d/](https://geeknull.github.io/lottery-3d/)

## 技术栈

- Vue 3.5（`<script setup>` Composition API）
- Vite 8（Rolldown）
- TypeScript 6（strict）
- vue-router 5
- Oxlint + ESLint 混搭 lint（create-vue 官方同款：oxlint 快扫通用规则，ESLint 负责 Vue 模板规则）
- mitt（事件总线）
- three.js / TWEEN（`public/lib` 全局脚本引入，见 TODO）

## 本地开发

要求 Node >= 22.12（推荐 24，见 `.nvmrc`）和 pnpm。

```bash
pnpm install
pnpm dev        # 开发服务器 http://localhost:8080
pnpm build      # 类型检查 + 生产构建（产物在 dist/）
pnpm preview    # 本地预览构建产物
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
- 2026.06：升级到 Vue 3 + Vite 8，部署切换为 GitHub Actions 自动发布

## TODO

- 奖品、抽奖人员可界面配置化
- 将 TS 贯彻到底（`3d-*.js`、`lottery-config.js` 等转 TS 并补全类型）
- three.js / TWEEN 从全局脚本迁移为 npm 依赖
- 背景音乐外链本地化（目前依赖网易云外链）

## 参考项目

- [three.js 元素周期表例子](https://github.com/mrdoob/three.js/blob/dev/examples/css3d_periodictable.html)
- [moshang-xc 版本](https://github.com/moshang-xc/lottery)
- [星空背景](https://github.com/curran/HTML5Examples/blob/gh-pages/canvas/starfield/script.js)
