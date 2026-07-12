# 发版说明自动化 设计文档

日期：2026-07-12

## 目标

每次部署时，自动从「本次 push 的提交」生成更新说明写入 `release-notes.json`，让 app 内更新横幅**永远有真内容**、不再显示「本次更新暂无说明」、**零 tag、零手动**。同时把「版本三套账」里的**发布说明**这本账收敛为单一来源。

## 现状（改动前）

- `public/release-notes.json` 手工维护（现停在 `2026.06.13`），发版时常忘更新。
- 一个「陈旧守卫」：横幅拉线上 `release-notes.json`，若其 `version` 仍等于构建内置的 `__NOTES_VERSION__`（vite.config 注入），判定「发了新版却忘写说明」，显示「本次更新暂无说明」而非旧内容。
- 版本三处各说各话：`package.json` `0.1.0`（不发 npm、死字段）、`release-notes.json` 日期（手工）、无 git tag。

## 决策（已与用户确认）

- **自定义轻量方案**（不用 release-please——它围绕批量 release + GitHub Release，和「每次 push 都自动更新」的持续部署模型不合，且会带来 tag 噪音）。
- **版本方案 = build id**：持续部署的 web app 标准是 build id，不是 SemVer、也不是日期。
  - `version` = 提交数 `git rev-list --count HEAD`（单调递增，越大越新，每 commit 必变）。
  - `build` = 短 SHA `git rev-parse --short HEAD`（精确定位线上是哪个 commit，便于回滚/复现）。
- **说明来源** = 本次 push 的提交范围 `git log $BEFORE..$AFTER --no-merges` 的提交标题，最多 8 条；`$BEFORE/$AFTER` 来自 GitHub Actions 的 `github.event.before` / `github.sha`，缺失（手动触发/首推/force-push）时回退「最近 8 条提交」。
- **在 CI 构建时生成**到 `public/ → dist`，**不 commit 回仓、不打 tag、无 CI 循环**。
- **退役陈旧守卫**：说明现在永远自动生成、不会再「忘写」，守卫失去意义，还会带来「同天多发→版本撞车→误报暂无说明」的坑；一并移除。
- `package.json` 版本**不动**（私有 app 用不到，收敛它属另一条债，本期不做）。

## 非目标（YAGNI）

- 按 `feat/fix` 归类、按约定式提交格式化、标记「内部提交不展示」——后续增量。
- git tag / GitHub Release。
- 统一 `package.json` 版本 / 打 tag 那本账。

## 设计

### ① 生成脚本 `scripts/gen-release-notes.mjs`（新增）

- 纯函数 `buildReleaseNotes(subjects: string[], version: string, build: string)` → `{ version, build, notes }`：过滤空行、去重、cap 8 条。**便于单测**。
- 主流程：读环境变量 `BEFORE`/`AFTER`；有效 `BEFORE`（非空、非全 0）→ 范围 `BEFORE..AFTER`，否则回退 `HEAD~8..HEAD`（或不足 8 时全取）；`git log <range> --no-merges --pretty=format:%s` 取标题；`version = git rev-list --count HEAD`、`build = git rev-parse --short HEAD`；写 `public/release-notes.json`（pretty JSON）。
- git 命令失败即非零退出（宁可让构建红、也不部署垃圾）。

### ② CI `.github/workflows/ci.yml`

- `verify` job 的 `actions/checkout@v6` 加 `with: fetch-depth: 0`（默认浅克隆取不到 push 范围与 rev-list 计数）。
- `pnpm build` **之前**加一步：
  ```yaml
  - run: node scripts/gen-release-notes.mjs
    env:
      BEFORE: ${{ github.event.before }}
      AFTER: ${{ github.sha }}
  ```
- 生成的 `release-notes.json` 随 `public/ → (vite build) → dist → deploy` 上线。PR 也会跑（用 PR 范围），但 PR 不部署，无害。

### ③ `public/release-notes.json` 降为占位

- 改成 `{ "version": "dev", "build": "local", "notes": [] }`，明确「真身在部署时生成」；本地构建用它兜底（本地不测更新横幅）。

### ④ 横幅 `LotteryUpdateBanner.tsx` 退役守卫

- 去掉 `const fresh = data?.version !== __NOTES_VERSION__`；直接按 `notes` 是否非空决定：
  - 拉取失败 → 「暂时拿不到更新内容」；
  - `notes` 非空 → 展示；
  - `notes` 为空 → 「本次更新暂无说明」（罕见：0 非 merge 提交）。
- 更新顶部注释（删掉守卫那段说明）。

### ⑤ 删除 `__NOTES_VERSION__`

- `vite.config.ts`：删 `readNotesVersion()` 与 `define: { __NOTES_VERSION__ }`。
- `src/env.d.ts`：删 `declare const __NOTES_VERSION__`。

## 测试

- **单测 `scripts/gen-release-notes.test.mjs`**（或放 src 下走 vitest）：`buildReleaseNotes` 过滤空/去重/cap 8、字段正确。
- **`LotteryUpdateBanner.test.tsx`**：删掉守卫那条测试（`version === __NOTES_VERSION__ → 暂无说明`，该行为已移除且 `__NOTES_VERSION__` 也删了）；把「版本不同→展示」「版本变了但 notes 空→暂无说明」两条**去掉版本框架、按 notes 有无重述**；错误/HTTP 错/未展开不请求三条不变。
- 无需 E2E（更新横幅需 SW 更新才出现，一直是单测覆盖）。

## 影响与取舍

- 说明质量 = commit 标题质量（现有提交写得规整，直接能用）；一次 push 多 commit（如刚才 21 个）→ 列这批、cap 8。
- 收敛了「发布说明」这本账为单一来源（部署生成的 release-notes.json）；`package.json` 的 `0.1.0` 仍是形式字段。
- 本次上线的 `2026.07.xx` 说明：自动化上线后**下次 push 自动生成**；想补「本次」可用同脚本手动跑一次。
