# Plan 002: 名字以 emoji 或生僻字开头时不再白屏

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/avatar.ts src/views/lottery/core/avatar.test.ts src/views/lottery/core/avatar-styles.ts src/views/lottery/core/avatar-styles.test.ts src/views/lottery/core/lottery-config-users.test.ts src/main.tsx e2e/reliability.spec.ts`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

名单里只要有一个名字以 emoji 或生僻字（Unicode 扩展区汉字，如 𠮷）开头，头像生成就会抛 `URIError`，而且兜底函数同样抛错。这已在真实浏览器复现：

- **默认设置**下，把这种名字贴到名单第一行，配置面板渲染时崩溃，整个页面变白。
- 选择「渐变首字」或「纯色首字」风格并保存后，`lottery-config.ts` 在模块加载时崩溃，每次打开都白屏，配置按钮也没有了，用户只能清站点数据，抽奖进度随之丢失。

项目没有 ErrorBoundary，任何渲染异常都会让投影画面全白。修完后，这类名字能正常显示，其他渲染异常也会显示可刷新的错误页。

## Current state

相关文件：

- `src/views/lottery/core/avatar.ts`：纯色首字头像 `generateAvatar`。
- `src/views/lottery/core/avatar-styles.ts`：头像风格注册表，`richAvatar` 和 `generateAvatarFor`。
- `src/views/lottery/core/lottery-config.ts`：模块加载时调用 `buildCards`（第 49 行），这里抛错时 React 还没挂载，ErrorBoundary 捕获不到。
- `src/views/lottery/components/LotteryConfigPanel.tsx:68-71`：`useMemo` 为名单第一个名字生成四种风格的预览，所以默认风格也会触发。
- `src/main.tsx`：挂载入口。

`avatar.ts:18-29`，`charAt(0)` 把代理对截成半个字符，`encodeURIComponent` 遇到半个代理对就抛错：

```ts
export function generateAvatar(name: string): string {
  const char = name.trim().charAt(0) || '?';
  const color = COLORS[hashCode(name) % COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${color}"/>` +
    `<text x="50" y="54" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="52" fill="rgba(255,255,255,0.92)">${char}</text>` +
    `</svg>`;
  // btoa 不支持非 ASCII，用 utf8 + encodeURIComponent 形式
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
```

`avatar-styles.ts:27` 有同样的取法：

```ts
  const ch = name.trim().charAt(0) || '?'
```

`avatar-styles.ts:56-63`，注释说“永不抛”，但兜底也会抛：

```ts
// 生成头像；任何风格生成出错都兜底回纯色首字，永不抛。
export function generateAvatarFor(name: string, styleId: string = DEFAULT_AVATAR_STYLE): string {
  try {
    return styleOf(styleId).generate(name)
  } catch {
    return letterAvatar(name)
  }
}
```

`src/main.tsx` 的挂载代码：

```tsx
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

同一处还有一个小问题：`&`、`<` 开头的名字生成的是无效 SVG，头像显示为坏图。本计划一起修。

约定：

- 注释用中文。`avatar.ts` 用分号，`avatar-styles.ts` 不用分号，保持各文件原有风格。
- 组件各配一个 SCSS 文件，参考 `src/views/lottery/components/LotteryCompatNotice.tsx` 和 `lottery-compat-notice.scss`。
- 组件测试参考 `src/views/lottery/components/LotteryUpdateBanner.test.tsx`（`render`、`cleanup` 来自 `@testing-library/react`）。
- E2E 预置配置的写法参考 `e2e/lottery.spec.ts:183-197`。
- 构建目标包含 Firefox 114，不要用 `Intl.Segmenter` 或 `String.prototype.toWellFormed`。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/avatar.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过（基线 42 文件 416 项） |
| 单文件 E2E | `pnpm e2e e2e/reliability.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/avatar.ts`
- `src/views/lottery/core/avatar.test.ts`
- `src/views/lottery/core/avatar-styles.ts`
- `src/views/lottery/core/avatar-styles.test.ts`
- `src/views/lottery/core/lottery-config-users.test.ts`
- `src/views/lottery/components/LotteryErrorBoundary.tsx`（新建）
- `src/views/lottery/components/LotteryErrorBoundary.test.tsx`（新建）
- `src/views/lottery/components/lottery-error-boundary.scss`（新建）
- `src/main.tsx`
- `e2e/reliability.spec.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `src/views/lottery/core/lottery-config.ts`：不要给 `buildCards` 调用包 try/catch，根因修好后不需要。
- DiceBear 风格（`fun-emoji`、`bottts`）的生成逻辑。
- 名单校验规则：不要禁止 emoji 名字，它们是合法输入。

## Git workflow

- 分支：`advisor/002-avatar-white-screen`
- 提交信息用中文并带前缀，例如 `fix: 修复 emoji 开头姓名导致的白屏`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

在 `avatar.test.ts` 的 `describe('generateAvatar')` 里加：

```ts
  it('emoji 开头的名字取完整字符，不抛错', () => {
    expect(decodeURIComponent(generateAvatar('🐱小明'))).toContain('>🐱<')
  })

  it('扩展区汉字开头的名字取完整字符', () => {
    expect(decodeURIComponent(generateAvatar('𠮷田'))).toContain('>𠮷<')
  })

  it('孤立代理字符用问号代替，不抛错', () => {
    expect(decodeURIComponent(generateAvatar('\uD83D小明'))).toContain('>?<')
  })

  it.each(['&小红', '<小红', '>小红'])('%s 生成的 SVG 是合法 XML', name => {
    const svg = decodeURIComponent(generateAvatar(name).replace('data:image/svg+xml;utf8,', ''))
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
  })
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/avatar.test.ts` → 新增用例失败（`URI malformed` 或解析错误），原有用例通过。

### Step 2: 在 avatar.ts 里新增 avatarInitial 并使用

在 `generateAvatar` 之前加入，并把 `generateAvatar` 里的 `const char = ...` 改成 `const char = avatarInitial(name);`：

```ts
const XML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

// 取名字的第一个字符，用于放进 SVG 文本。
// 按码点取，emoji 和扩展区汉字不会被截成半个代理对；孤立代理无法 URL 编码，用问号代替。
export function avatarInitial(name: string): string {
  const first = Array.from(name.trim())[0] ?? '?';
  return first.replace(/\p{Cs}/gu, '?').replace(/[&<>]/g, char => XML_ENTITIES[char]);
}
```

`/\p{Cs}/gu` 在 `u` 模式下只匹配孤立代理，合法的代理对不受影响。

**Verify**：`pnpm exec vitest run src/views/lottery/core/avatar.test.ts` → 全部通过。

### Step 3: 修 richAvatar 和兜底

修改 `avatar-styles.ts`：

1. import 改成 `import { avatarInitial, generateAvatar as letterAvatar, hashCode } from './avatar'`。
2. 第 27 行改成 `const ch = avatarInitial(name)`。
3. 把 `generateAvatarFor` 改成：

```ts
// 生成头像；风格生成出错时回纯色首字，再出错就用问号头像，永不抛。
export function generateAvatarFor(name: string, styleId: string = DEFAULT_AVATAR_STYLE): string {
  try {
    return styleOf(styleId).generate(name)
  } catch {
    try {
      return letterAvatar(name)
    } catch {
      return letterAvatar('?')
    }
  }
}
```

在 `avatar-styles.test.ts` 的 `describe('generateAvatarFor 派发')` 里加：

```ts
  it.each(['🐱小明', '𠮷田', '\uD83D', '&<>', ''])('任何风格处理 %j 都不抛错', name => {
    for (const style of AVATAR_STYLES) {
      expect(generateAvatarFor(name, style.id).startsWith('data:')).toBe(true)
    }
  })
```

在 `lottery-config-users.test.ts` 的 `describe('buildCards')` 里加：

```ts
  it.each(['letter', 'letter-rich', 'fun-emoji', 'bottts'])('%s 风格下 emoji 开头的名字能建卡', style => {
    const { cardList } = buildCards([{ name: '🐱小明' }, { name: '𠮷田' }], style)
    expect(cardList.every(card => card.avatar.startsWith('data:'))).toBe(true)
  })
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/avatar-styles.test.ts src/views/lottery/core/avatar-styles.fallback.test.ts src/views/lottery/core/lottery-config-users.test.ts` → 全部通过。

### Step 4: 新增根级 ErrorBoundary

新建 `src/views/lottery/components/LotteryErrorBoundary.tsx`：

```tsx
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './lottery-error-boundary.scss'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// 渲染异常的最后防线：页面不能在投影上直接变白。
// 抽奖结果在揭晓前已经写入本机，这里只提示刷新，不做任何数据操作。
export default class LotteryErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="lottery-error-boundary" role="alert">
        <h1>页面出错了</h1>
        <p>已保存的抽奖进度不受影响，请刷新页面。如果反复出现，请把浏览器控制台的错误发给技术人员。</p>
        <button type="button" onClick={() => window.location.reload()}>刷新页面</button>
      </div>
    )
  }
}
```

新建 `lottery-error-boundary.scss`。这个页面在 `.lottery-wrap` 之外渲染，直接用固定颜色：

```scss
.lottery-error-boundary {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  color: #fff;
  text-align: center;
  background: #021620;

  button {
    padding: 8px 20px;
    font-size: 14px;
    color: #fff;
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 5px;
  }
}
```

修改 `src/main.tsx`：加 `import LotteryErrorBoundary from './views/lottery/components/LotteryErrorBoundary'`，把 `<App />` 包进去：

```tsx
  <StrictMode>
    <LotteryErrorBoundary>
      <App />
    </LotteryErrorBoundary>
  </StrictMode>,
```

新建 `LotteryErrorBoundary.test.tsx`：

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LotteryErrorBoundary from './LotteryErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LotteryErrorBoundary', () => {
  it('子组件正常时原样渲染', () => {
    render(<LotteryErrorBoundary><p>舞台</p></LotteryErrorBoundary>)
    expect(screen.getByText('舞台')).toBeTruthy()
  })

  it('子组件抛错时显示可刷新的错误页', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LotteryErrorBoundary><Boom /></LotteryErrorBoundary>)
    expect(screen.getByRole('alert').textContent).toContain('页面出错了')
    expect(screen.getByRole('button', { name: '刷新页面' })).toBeTruthy()
  })
})
```

**Verify**：`pnpm exec vitest run src/views/lottery/components/LotteryErrorBoundary.test.tsx` → 2 项通过；`pnpm type-check` → exit 0。

### Step 5: 加端到端回归

在 `e2e/reliability.spec.ts` 末尾加：

```ts
test('保存过 emoji 开头名字的配置后，页面仍能打开', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('___lottery___')
    localStorage.setItem('___lottery_countdown___', 'off')
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1, headerTitle: '头像回归',
      prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
      roster: ['🐱小明', '𠮷田', '&小红'],
      avatarStyle: 'letter-rich',
    }))
  })
  await page.reload()
  await expect(page.locator('.lottery-wrap')).toBeVisible()
  await expect(page.locator('.element')).toHaveCount(3)
  await expect(page.locator('.config-btn')).toBeVisible()
})

test('配置面板贴入 emoji 开头的名字不会让页面白屏', async ({ page }) => {
  await gotoFresh(page)
  await page.locator('.config-btn').click()
  await page.locator('.lottery-config-panel textarea').fill('🐱小明\n李四\n王五')
  await expect(page.locator('.lottery-config-panel')).toBeVisible()
  await expect(page.locator('.avatar-style-option')).toHaveCount(4)
})
```

**Verify**：`pnpm e2e e2e/reliability.spec.ts` → 全部通过，包含这 2 项新用例。

### Step 6: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。构建时的“主包大于 500 kB”提示是已知现象，可以忽略。

## Test plan

- `avatar.test.ts`：emoji、扩展区汉字、孤立代理、XML 特殊字符，共 6 个用例。
- `avatar-styles.test.ts`：所有风格处理异常名字都不抛错。
- `lottery-config-users.test.ts`：四种风格下建卡成功。
- `LotteryErrorBoundary.test.tsx`：正常渲染和错误页。
- `e2e/reliability.spec.ts`：保存后重开、面板贴入。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，上述新用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -rn "charAt(0)" src/views/lottery/core/avatar.ts src/views/lottery/core/avatar-styles.ts` 没有输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- 修好后 `e2e/reliability.spec.ts` 里的页面仍然白屏，或控制台出现 `URI malformed`：说明还有其他调用路径，报告堆栈，不要加 try/catch 掩盖。
- `/\p{Cs}/gu` 被 TypeScript 或 oxlint 拒绝。
- 需要修改 `lottery-config.ts` 或名单校验才能让测试通过。

## Maintenance notes

- 新增头像风格时，要把所有用名字生成 SVG 的代码都走 `avatarInitial`。
- ErrorBoundary 只捕获 React 渲染期的异常。`lottery-config.ts` 模块加载时抛错仍然会白屏，所以模块顶层的代码不能抛错。
- `Array.from` 按码点取字，组合 emoji（如国旗、家庭）只显示第一个码点。等构建目标不再包含 Firefox 114 后，可以换成 `Intl.Segmenter`。
- 审阅时重点看：`avatarInitial` 是否覆盖了两个 SVG 生成函数，错误页没有动任何数据。
