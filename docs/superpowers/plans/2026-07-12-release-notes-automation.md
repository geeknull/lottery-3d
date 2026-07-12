# 发版说明自动化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** CI 每次部署自动从「本次 push 的提交」生成 `release-notes.json`（version=提交数、build=短 SHA、notes=提交标题），退役陈旧守卫，横幅永远有真内容。

**Architecture:** 新增 `scripts/gen-release-notes.mjs` 在 CI `build` 前生成 `public/release-notes.json`（进 dist 部署，不 commit 回仓、不打 tag）；删除 `__NOTES_VERSION__` 守卫，横幅按 notes 有无展示。

**Tech Stack:** Node ESM 脚本 + Vitest + GitHub Actions + Vite。参考 spec：`docs/superpowers/specs/2026-07-12-release-notes-automation-design.md`

**规矩:** 一项一验一提交；commit 末行 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`；在 `main` 上提交。

---

## 文件结构
- 新建 `scripts/gen-release-notes.mjs`（生成脚本，导出纯函数 `buildReleaseNotes` + 直接执行时跑 main）
- 新建 `scripts/gen-release-notes.test.mjs`（`buildReleaseNotes` 单测）
- 改 `.github/workflows/ci.yml`（`fetch-depth: 0` + 生成步骤）
- 改 `public/release-notes.json`（降为占位）
- 改 `src/views/lottery/components/LotteryUpdateBanner.tsx`（退役守卫）
- 改 `src/views/lottery/components/LotteryUpdateBanner.test.tsx`（更新测试）
- 改 `vite.config.ts` + `src/env.d.ts`（删 `__NOTES_VERSION__`）

---

## Task 1: 生成脚本 + 单测

**Files:** Create `scripts/gen-release-notes.mjs`, `scripts/gen-release-notes.test.mjs`

- [ ] **Step 1: 写失败测试 `scripts/gen-release-notes.test.mjs`**

```js
import { describe, it, expect } from 'vitest'
import { buildReleaseNotes } from './gen-release-notes.mjs'

describe('buildReleaseNotes', () => {
  it('组装 version/build/notes', () => {
    expect(buildReleaseNotes(['改了 A', '改了 B'], '142', '1f9e568'))
      .toEqual({ version: '142', build: '1f9e568', notes: ['改了 A', '改了 B'] })
  })
  it('去两端空白、去空行、去重', () => {
    expect(buildReleaseNotes(['  A  ', '', 'A', 'B'], '1', 'x').notes).toEqual(['A', 'B'])
  })
  it('最多 8 条', () => {
    const many = Array.from({ length: 20 }, (_, i) => 'c' + i)
    expect(buildReleaseNotes(many, '1', 'x').notes).toHaveLength(8)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — Run: `pnpm test gen-release-notes` → FAIL（模块不存在）。

- [ ] **Step 3: 实现 `scripts/gen-release-notes.mjs`**

```js
// 从「本次 push 的提交」生成 public/release-notes.json：
// version=提交数、build=短 SHA、notes=push 范围内非 merge 提交标题（cap 8）。
// CI 在 build 前运行；不 commit 回仓、不打 tag。
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MAX_NOTES = 8

// 纯函数：把提交标题整理成 notes（去两端空白、去空、去重、cap）。便于单测。
export function buildReleaseNotes(subjects, version, build) {
  const seen = new Set()
  const notes = []
  for (const raw of subjects) {
    const s = (raw || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    notes.push(s)
    if (notes.length >= MAX_NOTES) break
  }
  return { version, build, notes }
}

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' }).trim()
}

function main() {
  const before = process.env.BEFORE || ''
  const after = process.env.AFTER || 'HEAD'
  // 有效 before（非空、非全 0）→ 用 push 范围；否则回退最近 8 条
  const validBefore = before && !/^0+$/.test(before)
  const range = validBefore ? `${before}..${after}` : `-${MAX_NOTES}`
  const log = git(`log ${range} --no-merges --pretty=format:%s`)
  const subjects = log ? log.split('\n') : []
  const version = git('rev-list --count HEAD')
  const build = git('rev-parse --short HEAD')
  const data = buildReleaseNotes(subjects, version, build)
  const out = fileURLToPath(new URL('../public/release-notes.json', import.meta.url))
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n')
  console.log(`release-notes.json: version=${version} build=${build} notes=${data.notes.length}`)
}

// 仅在被直接执行时跑 main（被 import/测试时不跑）
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
```

- [ ] **Step 4: 跑测试确认通过** — Run: `pnpm test gen-release-notes` → PASS（3 tests）。

- [ ] **Step 5: 本地真跑一次脚本，确认产出合法** — Run: `node scripts/gen-release-notes.mjs && cat public/release-notes.json`
  Expected: 打印 `release-notes.json: version=<数字> build=<短sha> notes=<n>`；文件是合法 JSON，含 `version`(数字字符串)/`build`(短 sha)/`notes`(数组，本地无 BEFORE → 最近 8 条提交标题)。
  **注意：这一步会改写 `public/release-notes.json`。下一步先把它还原成占位再一起提交（见 Step 6）。**

- [ ] **Step 6: 还原 `public/release-notes.json` 为占位**（Step 5 改写了它；本任务不改它的最终形态，Task 2 才定占位。此处还原到 git 版本，避免把本地生成物提交进 Task 1）

Run: `git checkout -- public/release-notes.json`

- [ ] **Step 7: lint**（脚本是 node ESM，注意 node 全局）— Run: `pnpm lint`
  Expected: 通过。若 eslint 报 `process`/`console` 未定义（配置未把 `scripts/**` 当 node 环境），在 `eslint.config.js` 给 `scripts/**/*.mjs` 加一段 `languageOptions.globals` 用 node globals 的 override（可用已依赖的 `globals` 包：`...globals.node`）。仅加必要 override，别动其它规则。

- [ ] **Step 8: 提交**
```bash
git add scripts/gen-release-notes.mjs scripts/gen-release-notes.test.mjs eslint.config.js
git commit -m "$(printf '发版说明生成脚本：从 push 提交范围产出 release-notes\n\nscripts/gen-release-notes.mjs：version=提交数、build=短 SHA、notes=本次\npush 非 merge 提交标题(cap 8)，写 public/release-notes.json。纯函数\nbuildReleaseNotes 补单测。CI 里用，不 commit 回仓、不打 tag。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```
（若 Step 7 没改 eslint.config.js，就不要 add 它。）

---

## Task 2: 接 CI + 退役守卫 + 占位 + 删 __NOTES_VERSION__

**Files:** `.github/workflows/ci.yml`, `public/release-notes.json`, `LotteryUpdateBanner.tsx`, `LotteryUpdateBanner.test.tsx`, `vite.config.ts`, `src/env.d.ts`

- [ ] **Step 1: CI 接线（ci.yml）** — 把 `verify` job 的 checkout 改为带全历史，并在 `pnpm build` 前加生成步骤：

把
```yaml
      - uses: actions/checkout@v6
```
改成
```yaml
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0  # 需完整历史算 push 范围与提交数
```
在 `- run: pnpm build` **之前**插入：
```yaml
      - run: node scripts/gen-release-notes.mjs
        env:
          BEFORE: ${{ github.event.before }}
          AFTER: ${{ github.sha }}
```

- [ ] **Step 2: `public/release-notes.json` 降为占位** — 整个文件替换为：
```json
{
  "version": "dev",
  "build": "local",
  "notes": []
}
```

- [ ] **Step 3: 更新横幅测试（先改测试，TDD）`LotteryUpdateBanner.test.tsx`**
  - 删除第 7 行注释 `// __NOTES_VERSION__ 由 vite.config...`。
  - **删除**「线上版本与构建内置版本相同（发版漏更新说明）→ ...」这条测试（整个 `it(...)`，约 40-47 行）——该行为随守卫移除、且 `__NOTES_VERSION__` 也删了。
  - 把「线上版本与构建内置版本不同 → 展示新版更新内容」这条**改名去掉版本框架**，正文不变（mock 里的 `version: '9999.99.99'` 可留可删，不再有意义）：
    ```ts
    it('notes 非空 → 展示更新内容', async () => {
      mockReleaseNotes({ notes: ['新功能一', '新功能二'] })
    ```
  - 把「线上版本变了但 notes 为空 → ...」改名为：
    ```ts
    it('notes 为空 → 显示「本次更新暂无说明」', async () => {
      mockReleaseNotes({ notes: [] })
    ```
  - 其余三条（拉取失败 / HTTP 非 2xx / 未点开不请求）不动。

- [ ] **Step 4: 跑横幅测试确认失败** — Run: `pnpm test LotteryUpdateBanner` → 预期 FAIL（组件仍引用已删的 `__NOTES_VERSION__`，或行为不符）。

- [ ] **Step 5: 退役守卫（`LotteryUpdateBanner.tsx`）** — 把 `loadDetail` 里
```ts
      const data = await res.json()
      const fresh = data?.version !== __NOTES_VERSION__ // 版本变了 = 本次发版确实更新了说明
      const items = fresh && Array.isArray(data?.notes)
        ? data.notes.filter((n: unknown): n is string => typeof n === 'string')
        : []
      return items.length > 0 ? { kind: 'notes', items } : { kind: 'none' }
```
改成
```ts
      const data = await res.json()
      const items = Array.isArray(data?.notes)
        ? data.notes.filter((n: unknown): n is string => typeof n === 'string')
        : []
      return items.length > 0 ? { kind: 'notes', items } : { kind: 'none' }
```
并把文件顶部注释里「陈旧守卫」那段（约 11-13 行）删掉或改成一句：`// 「看看更新了什么」拉 release-notes.json（部署时按本次提交自动生成）展示。`

- [ ] **Step 6: 删 `__NOTES_VERSION__` 定义** —
  - `vite.config.ts`：删除 `readNotesVersion()` 函数（约 9-18 行）与 `define: { __NOTES_VERSION__: JSON.stringify(readNotesVersion()) },`（约 22-24 行）。若删 define 后 `define` 对象空了就整个删掉，保持 config 合法。
  - `src/env.d.ts`：删除 `declare const __NOTES_VERSION__: string`（及其上一行注释）。

- [ ] **Step 7: 跑横幅测试确认通过** — Run: `pnpm test LotteryUpdateBanner` → PASS。

- [ ] **Step 8: 全量单测 + type-check + lint + build** — Run: `pnpm test && pnpm type-check && pnpm lint && pnpm build`
  Expected: 全绿；`pnpm build` 成功（确认删 `__NOTES_VERSION__` 后 vite 构建无引用错误）。

- [ ] **Step 9: 提交**
```bash
git add .github/workflows/ci.yml public/release-notes.json src/views/lottery/components/LotteryUpdateBanner.tsx src/views/lottery/components/LotteryUpdateBanner.test.tsx vite.config.ts src/env.d.ts
git commit -m "$(printf '发版说明自动化接入 CI + 退役陈旧守卫\n\nCI build 前跑 gen-release-notes（fetch-depth:0 取 push 范围），生成的\nrelease-notes.json 随 dist 部署。说明现永远自动生成，移除 __NOTES_VERSION__\n陈旧守卫与 vite define，横幅按 notes 有无展示。release-notes.json 降为占位。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## 收尾
- CI 门禁本身仍只能靠真实 push 验证（generate 步骤 + fetch-depth 在 Actions 里才真跑）；本地已验证脚本产出与全量单测/build。
- 下次 push 后，可在 Actions 日志看到 `release-notes.json: version=… build=… notes=…`，线上更新横幅即显示本次提交标题。
