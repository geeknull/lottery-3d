# Plan 010: CI 的部署权限只给部署任务

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- .github/workflows/ci.yml`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

`.github/workflows/ci.yml` 把 `pages: write` 和 `id-token: write` 写在工作流顶层，所以 `verify` 任务也拿到了。`verify` 会安装第三方依赖、运行测试和构建脚本，它并不需要部署权限。只把权限给真正部署的 `deploy` 任务，可以缩小依赖链被利用时的影响范围。

`actions/deploy-pages` 的官方 README 写明：执行部署的那个任务至少需要 `pages: write` 和 `id-token: write`，官方示例也是把它们写在部署任务上。

## Current state

`.github/workflows/ci.yml:11-14`：

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

`deploy` 任务（文件末尾）目前没有 `permissions` 块：

```yaml
  deploy:
    # 只有非 PR（main 推送或手动触发）且 verify 全绿才部署
    if: ${{ github.event_name != 'pull_request' }}
    needs: verify
    runs-on: ubuntu-latest
    # 部署串行化，避免并发部署互相打断
    concurrency:
      group: pages
      cancel-in-progress: false
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

`verify` 任务里的 `actions/upload-pages-artifact` 只是上传构建产物，不需要 `pages` 权限。

注意：任务级 `permissions` 会**完全替换**顶层设置，不是合并。`deploy` 不检出代码，所以不需要 `contents: read`。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| YAML 语法 | `pnpm exec yaml valid < .github/workflows/ci.yml` | exit 0，无输出 |
| 权限位置 | `grep -n "pages: write\|id-token: write" .github/workflows/ci.yml` | 两行都在 `deploy` 任务里，缩进 6 个空格 |

## Scope

**In scope**（只能修改这些文件）：
- `.github/workflows/ci.yml`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 其他步骤、action 版本、触发条件、并发设置。
- 不要顺手把 action 固定到 commit SHA，那是另一个决定。

## Git workflow

- 分支：`advisor/010-ci-least-privilege`
- 提交信息用中文并带前缀，例如 `ci: 部署权限只授予 deploy 任务`
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 收紧顶层权限

把顶层的 `permissions` 改成：

```yaml
permissions:
  contents: read
```

**Verify**：`sed -n 11,13p .github/workflows/ci.yml` → 只有 `permissions:` 和 `contents: read` 两行有内容。

### Step 2: 给 deploy 任务单独授权

在 `deploy` 任务的 `runs-on: ubuntu-latest` 之后加：

```yaml
    # 部署到 Pages 需要这两项权限，只授予这个任务
    permissions:
      pages: write
      id-token: write
```

**Verify**：
- `pnpm exec yaml valid < .github/workflows/ci.yml` → exit 0
- `grep -n "pages: write\|id-token: write" .github/workflows/ci.yml` → 两行，行号都大于 `deploy:` 所在行号（用 `grep -n "^  deploy:" .github/workflows/ci.yml` 查）

### Step 3: 告诉操作者如何验证

工作流只能靠一次真实运行来验证，本地没有办法完整检查。完成后在报告里写明：

> 合并到 main 后，查看 GitHub Actions 里 `CI & Deploy` 的 `deploy` 任务是否成功，并确认 GitHub Pages 站点已更新。如果 `deploy` 报权限错误，回滚这个提交即可。

不要自己 push 去验证。

## Test plan

本地只能做 YAML 语法和结构检查。真正的验证是合并后的第一次 Actions 运行。

## Done criteria

- [ ] `pnpm exec yaml valid < .github/workflows/ci.yml` 退出码为 0
- [ ] 顶层 `permissions` 只有 `contents: read`
- [ ] `deploy` 任务有 `pages: write` 和 `id-token: write`
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] 报告里写明了需要一次真实运行来验证
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际文件对不上。
- 发现 `verify` 任务里有步骤确实需要 `pages` 或 `id-token` 权限（例如新增了别的部署步骤）。

## Maintenance notes

- 以后新增需要额外权限的任务，在任务级单独声明，不要再往顶层加。
- 如果以后要提高供应链安全，可以考虑把 action 固定到 commit SHA，并加 Dependabot 更新。这两件事本计划没有做。
