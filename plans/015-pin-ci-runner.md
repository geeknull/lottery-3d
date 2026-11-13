# Plan 015: CI 的 verify 任务固定在 ubuntu-24.04

> **执行说明**：按步骤执行，每一步都运行验证命令。遇到“STOP 条件”就停下报告。如果是审阅者派你来执行，并说明由他们维护索引，就不用更新 `plans/README.md`。
>
> **漂移检查（先运行）**：`git diff --stat f93fbbd..HEAD -- .github/workflows/ci.yml`

## Status

- **Priority**: P1（阻塞上线）
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `f93fbbd`, 2026-11-13

## Why this matters

2026-11-13 推送第一批修复后，CI 运行 43466572863 在 `pnpm exec playwright install --with-deps chromium` 这一步失败：

```
Error: ERROR: Playwright does not support chromium on ubuntu26.04-x64
```

GitHub 的 `ubuntu-latest` 已从 `ubuntu-24.04`（2026-09-30 最后一次成功运行 36733626590 使用的镜像）换成 `ubuntu-26.04`，项目当前的 `@playwright/test` 1.60 不支持新镜像。lint、单测、构建都通过，E2E 没有开始，部署被门禁跳过，线上仍是 `a9634fb`。

把 `verify` 任务固定在已知可用的 `ubuntu-24.04` 即可恢复。升级 Playwright 是另一件事，影响 lockfile 和浏览器版本，本计划不做。

## Current state

`.github/workflows/ci.yml:22-23`：

```yaml
  verify:
    runs-on: ubuntu-latest
```

`deploy` 任务（第 64 行）也用 `ubuntu-latest`，但只运行 `actions/deploy-pages`，不安装 Playwright，不受影响。

## Scope

**In scope**：`.github/workflows/ci.yml`（只改 `verify` 的 `runs-on`）

**Out of scope**：`deploy` 任务、权限设置（计划 010 负责）、`package.json` 和 lockfile。

## Git workflow

- 分支：`advisor/015-pin-ci-runner`
- 提交信息：`ci: verify 任务固定 ubuntu-24.04，避开 Playwright 不支持的新镜像`

## Steps

### Step 1: 固定镜像

把 `verify` 任务的 `runs-on: ubuntu-latest` 改成：

```yaml
    # ubuntu-latest 已切到 26.04，当前 Playwright 不支持；升级 Playwright 后可改回
    runs-on: ubuntu-24.04
```

**Verify**：`pnpm exec yaml valid < .github/workflows/ci.yml` → exit 0；`grep -n "runs-on" .github/workflows/ci.yml` → 第一处为 `ubuntu-24.04`，第二处仍为 `ubuntu-latest`。

## Done criteria

- [ ] YAML 校验通过
- [ ] 只有 `verify` 的 `runs-on` 改变（`git diff` 只有这几行）
- [ ] 报告里写明：真正的验证是下一次推送后的 CI 运行

## STOP conditions

- `verify` 的 `runs-on` 已经不是 `ubuntu-latest`。

## Maintenance notes

- 升级 `@playwright/test` 到支持 ubuntu-26.04 的版本后，可以改回 `ubuntu-latest`。升级时要重新跑全量 E2E 和 PWA E2E。
- GitHub 最终会下线 `ubuntu-24.04` 镜像，在那之前要完成 Playwright 升级。
