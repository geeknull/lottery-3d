# 头像风格设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给配置面板加"头像风格"选择器（letter/letter-rich/fun-emoji/bottts，默认 fun-emoji），并在选了重风格 + 大名单时软提示、可选自动降级。

**Architecture:** 新增 `avatar-styles.ts` 风格注册表 + `generateAvatarFor(name, styleId)` 派发 + `resolveStyle(...)` 降级纯函数；配置增两字段 `avatarStyle`/`avatarAutoDowngrade`（不进 configHash，换风格不清进度）；`buildCards` 按生效风格生成；配置面板加选择器 UI。DiceBear 静态内置。

**Tech Stack:** React 19 + TS strict + Vitest + Playwright + `@dicebear/core` `@dicebear/collection` v9。

**规矩:** 一项一验一提交；改 DOM/选择器提交前跑全套 E2E；本地 E2E 用临时 8090 配置（8080 被别的项目占，见记忆 e2e-port-8080-conflict）。

参考 spec：`docs/superpowers/specs/2026-07-11-avatar-styles-design.md`

---

## 文件结构

- 新建 `src/views/lottery/core/avatar-styles.ts` — 风格注册表、`generateAvatarFor`、`resolveStyle`、常量。
- 新建 `src/views/lottery/core/avatar-styles.test.ts` — 注册表/派发/resolveStyle 单测。
- 新建 `src/views/lottery/core/avatar-styles.fallback.test.ts` — DiceBear 抛错兜底单测（mock）。
- 改 `src/views/lottery/core/avatar.ts` — 导出 `hashCode`（供 rich 复用）。
- 改 `src/views/lottery/core/config-store.ts` — 加 `avatarStyle`/`avatarAutoDowngrade` 字段 + 校验。
- 改 `src/views/lottery/core/config-store.test.ts` — 字段校验测试。
- 改 `src/views/lottery/core/lottery-config-users.ts` — `buildCards(people, styleId)`。
- 改 `src/views/lottery/core/lottery-config-users.test.ts` — buildCards 调用传 `'letter'`。
- 改 `src/views/lottery/core/lottery-config.ts` — 算生效风格并传入 buildCards。
- 改 `src/views/lottery/components/LotteryConfigPanel.tsx` — 头像风格选择区。
- 改 `src/views/lottery/components/lottery-config-panel.scss` — 选择器样式。
- 改 `e2e/lottery.spec.ts` — 选择/持久化/提示/降级 E2E。
- 改 `package.json` / lockfile — 加 DiceBear 依赖。

---

## Task 1: 依赖 + 风格注册表 + resolveStyle

**Files:**
- Modify: `src/views/lottery/core/avatar.ts`
- Create: `src/views/lottery/core/avatar-styles.ts`
- Create: `src/views/lottery/core/avatar-styles.test.ts`
- Create: `src/views/lottery/core/avatar-styles.fallback.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 装依赖**

Run: `pnpm add @dicebear/core@9 @dicebear/collection@9`
Expected: package.json 出现两个依赖，lockfile 更新，`pnpm install` 成功。

- [ ] **Step 2: 导出 hashCode（avatar.ts）**

把 `avatar.ts` 里 `function hashCode` 改为导出（其余不动）：

```ts
export function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}
```

- [ ] **Step 3: 写失败测试 avatar-styles.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import {
  AVATAR_STYLES, DEFAULT_AVATAR_STYLE, LIGHT_FALLBACK_STYLE, AVATAR_HEAVY_WARN,
  generateAvatarFor, resolveStyle,
} from './avatar-styles'

describe('AVATAR_STYLES 注册表', () => {
  it('含四个风格，默认与降级目标都在表内', () => {
    const ids = AVATAR_STYLES.map(s => s.id)
    expect(ids).toEqual(['fun-emoji', 'letter-rich', 'letter', 'bottts'])
    expect(ids).toContain(DEFAULT_AVATAR_STYLE)
    expect(ids).toContain(LIGHT_FALLBACK_STYLE)
    expect(AVATAR_STYLES.find(s => s.id === 'bottts')?.heavy).toBe(true)
    expect(AVATAR_STYLES.find(s => s.id === 'fun-emoji')?.heavy).toBe(false)
  })

  it('每个风格都能生成非空 data: 头像', () => {
    for (const s of AVATAR_STYLES) {
      const uri = s.generate('张三')
      expect(uri.startsWith('data:')).toBe(true)
      expect(uri.length).toBeGreaterThan(20)
    }
  })
})

describe('generateAvatarFor 派发', () => {
  it('按 id 生成；letter-rich 含渐变与首字', () => {
    const uri = generateAvatarFor('张三', 'letter-rich')
    expect(uri).toContain('linearGradient')
    expect(decodeURIComponent(uri)).toContain('张')
  })
  it('未知 id 回默认风格（不抛）', () => {
    const uri = generateAvatarFor('张三', 'no-such-style')
    expect(uri.startsWith('data:')).toBe(true)
  })
  it('不传 styleId 用默认', () => {
    expect(generateAvatarFor('张三').startsWith('data:')).toBe(true)
  })
})

describe('resolveStyle 降级', () => {
  it('开降级 + 重风格 + 超阈值 → 轻量', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN + 1, true)).toBe(LIGHT_FALLBACK_STYLE)
  })
  it('未超阈值 → 原样', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN, true)).toBe('bottts')
  })
  it('未开降级 → 原样', () => {
    expect(resolveStyle('bottts', AVATAR_HEAVY_WARN + 999, false)).toBe('bottts')
  })
  it('非重风格 → 原样', () => {
    expect(resolveStyle('fun-emoji', AVATAR_HEAVY_WARN + 999, true)).toBe('fun-emoji')
  })
  it('非法 id → 默认风格', () => {
    expect(resolveStyle('no-such', 10, false)).toBe(DEFAULT_AVATAR_STYLE)
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm test avatar-styles`
Expected: FAIL（`avatar-styles` 模块不存在）。

- [ ] **Step 5: 实现 avatar-styles.ts**

```ts
// 头像风格注册表：把"生成款头像"抽象成可选风格，供配置面板选择、buildCards 生成。
import { createAvatar } from '@dicebear/core'
import { funEmoji, bottts } from '@dicebear/collection'
import { generateAvatar as letterAvatar, hashCode } from './avatar'

export interface AvatarStyle {
  id: string
  label: string
  heavy: boolean               // 是否重（触发大名单提示/降级）
  generate: (name: string) => string  // → data URI
}

export const DEFAULT_AVATAR_STYLE = 'fun-emoji'
export const LIGHT_FALLBACK_STYLE = 'letter-rich'
export const AVATAR_HEAVY_WARN = 500

// 零依赖「渐变首字」：按名字 seed 出渐变底 + 几何点缀 + 首字
function richAvatar(name: string): string {
  const h = hashCode(name)
  const h1 = h % 360
  const h2 = (h1 + 40 + ((h >> 3) % 80)) % 360
  const s = 55 + ((h >> 5) % 20)
  const l1 = 32 + ((h >> 7) % 10)
  const l2 = 20 + ((h >> 9) % 10)
  const ang = (h >> 11) % 360
  const dot = (h >> 13) % 3
  const ch = name.trim().charAt(0) || '?'
  const id = 'g' + h.toString(36)
  const accent = dot === 0 ? ''
    : dot === 1 ? `<circle cx="82" cy="20" r="26" fill="rgba(255,255,255,.10)"/>`
    : `<path d="M0 78 L46 100 L0 100 Z" fill="rgba(255,255,255,.10)"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="${id}" gradientTransform="rotate(${ang} .5 .5)">` +
    `<stop offset="0" stop-color="hsl(${h1} ${s}% ${l1}%)"/>` +
    `<stop offset="1" stop-color="hsl(${h2} ${s}% ${l2}%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#${id})"/>${accent}` +
    `<text x="50" y="55" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="48" font-weight="600" ` +
    `fill="rgba(255,255,255,0.95)">${ch}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export const AVATAR_STYLES: AvatarStyle[] = [
  { id: 'fun-emoji', label: '表情', heavy: false, generate: n => createAvatar(funEmoji, { seed: n, size: 96 }).toDataUri() },
  { id: 'letter-rich', label: '渐变首字', heavy: false, generate: richAvatar },
  { id: 'letter', label: '纯色首字', heavy: false, generate: letterAvatar },
  { id: 'bottts', label: '机器人', heavy: true, generate: n => createAvatar(bottts, { seed: n, size: 96 }).toDataUri() },
]

const byId = new Map(AVATAR_STYLES.map(s => [s.id, s]))
function styleOf(id: string): AvatarStyle {
  return byId.get(id) ?? byId.get(DEFAULT_AVATAR_STYLE)!
}

// 生成头像；任何风格生成出错都兜底回纯色首字，永不抛。
export function generateAvatarFor(name: string, styleId: string = DEFAULT_AVATAR_STYLE): string {
  try {
    return styleOf(styleId).generate(name)
  } catch {
    return letterAvatar(name)
  }
}

// 生效风格：开了自动降级 + 重风格 + 名单超阈值 → 降级为轻量；否则原样。非法 id → 默认。
export function resolveStyle(styleId: string, rosterSize: number, autoDowngrade: boolean): string {
  const s = styleOf(styleId)
  if (autoDowngrade && s.heavy && rosterSize > AVATAR_HEAVY_WARN) return LIGHT_FALLBACK_STYLE
  return s.id
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm test avatar-styles`
Expected: PASS（avatar-styles.test.ts 全绿）。

- [ ] **Step 7: 写兜底测试 avatar-styles.fallback.test.ts**

```ts
import { describe, it, expect, vi } from 'vitest'

// 让 DiceBear 生成抛错，验证 generateAvatarFor 兜底回纯色首字、不抛
vi.mock('@dicebear/core', () => ({
  createAvatar: () => { throw new Error('boom') },
}))

describe('generateAvatarFor 兜底', () => {
  it('DiceBear 抛错时回纯色首字，不抛', async () => {
    const { generateAvatarFor } = await import('./avatar-styles')
    const uri = generateAvatarFor('张三', 'bottts')
    expect(uri.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodeURIComponent(uri)).toContain('张') // 纯色首字含姓氏
  })
})
```

- [ ] **Step 8: 跑兜底测试**

Run: `pnpm test avatar-styles.fallback`
Expected: PASS。

- [ ] **Step 9: type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: 均无输出/通过。

- [ ] **Step 10: 提交**

```bash
git add src/views/lottery/core/avatar.ts src/views/lottery/core/avatar-styles.ts src/views/lottery/core/avatar-styles.test.ts src/views/lottery/core/avatar-styles.fallback.test.ts package.json pnpm-lock.yaml
git commit -m "$(printf '头像风格注册表 + 静态内置 DiceBear\n\n新增 avatar-styles：letter/letter-rich/fun-emoji/bottts 四风格 +\ngenerateAvatarFor 派发（DiceBear 出错兜底回首字、永不抛）+ resolveStyle\n大名单降级纯函数。装 @dicebear/core @dicebear/collection。补单测。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 2: config 字段 + buildCards 接线

**Files:**
- Modify: `src/views/lottery/core/config-store.ts`
- Modify: `src/views/lottery/core/config-store.test.ts`
- Modify: `src/views/lottery/core/lottery-config-users.ts`
- Modify: `src/views/lottery/core/lottery-config-users.test.ts`
- Modify: `src/views/lottery/core/lottery-config.ts`

- [ ] **Step 1: 写失败测试（config-store.test.ts）**

在 `describe('parseConfigJson', ...)` 内追加：

```ts
  it('接受可选的 avatarStyle / avatarAutoDowngrade', () => {
    const cfg = { ...validConfig, avatarStyle: 'bottts', avatarAutoDowngrade: true }
    const parsed = parseConfigJson(JSON.stringify(cfg))
    expect(parsed?.avatarStyle).toBe('bottts')
    expect(parsed?.avatarAutoDowngrade).toBe(true)
  })

  it('avatarStyle 非字符串 / avatarAutoDowngrade 非布尔则拒绝', () => {
    expect(parseConfigJson(JSON.stringify({ ...validConfig, avatarStyle: 123 }))).toBeNull()
    expect(parseConfigJson(JSON.stringify({ ...validConfig, avatarAutoDowngrade: 'yes' }))).toBeNull()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test config-store`
Expected: FAIL（新字段未定义/未校验，非字符串未被拒）。

- [ ] **Step 3: config-store.ts 加字段 + 校验**

`UserLotteryConfig` 接口加两行：

```ts
export interface UserLotteryConfig {
  version: 1;
  headerTitle: string;
  prizes: PrizeConfig[];
  roster: (string | RosterEntry)[]; // 抽奖名单（允许重名）
  avatarStyle?: string;          // 生成头像风格 id，缺省 fun-emoji
  avatarAutoDowngrade?: boolean; // 大名单自动降级为轻量头像
}
```

`isValidConfig` 的 return 布尔链里，`Array.isArray(cfg.roster)` 之前加两个校验：

```ts
    (cfg.avatarStyle === undefined || typeof cfg.avatarStyle === 'string') &&
    (cfg.avatarAutoDowngrade === undefined || typeof cfg.avatarAutoDowngrade === 'boolean') &&
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test config-store`
Expected: PASS。

- [ ] **Step 5: buildCards 接受 styleId（lottery-config-users.ts）**

顶部换 import（删 `./avatar` 的 generateAvatar，改用 avatar-styles）：

```ts
import { generateAvatarFor } from './avatar-styles';
```
（删除原 `import { generateAvatar } from './avatar';`）

`buildCards` 签名与头像行：

```ts
export function buildCards(people: Person[], styleId: string): { cardList: Card[]; colCount: number; rowCount: number } {
  const colCount = calcColCount(people.length);
  const nameCount = new Map<string, number>();
  const cardList: Card[] = people.map((person, i) => {
    const seen = nameCount.get(person.name) ?? 0;
    nameCount.set(person.name, seen + 1);
    return {
      name: person.name,
      id: seen === 0 ? person.name : `${person.name}-${seen + 1}`,
      avatar: person.avatar ?? generateAvatarFor(person.name, styleId),
      index: i,
      row: Math.floor(i / colCount) + 1,
      col: (i % colCount) + 1,
    };
  });
  return { cardList, colCount, rowCount: Math.max(1, Math.ceil(people.length / colCount)) };
}
```

- [ ] **Step 6: 更新 buildCards 单测调用（lottery-config-users.test.ts）**

把 4 处 `buildCards(X)` 改成 `buildCards(X, 'letter')`：

```ts
    const { cardList } = buildCards([{ name: '张三' }, { name: '张三' }, { name: '张三' }], 'letter')
```
```ts
    const { cardList } = buildCards([{ name: '张三' }], 'letter')
```
```ts
    const { cardList } = buildCards([{ name: '张三', avatar: 'http://example.com/a.png' }], 'letter')
```
```ts
    const { cardList, colCount, rowCount } = buildCards(people, 'letter')
```

- [ ] **Step 7: lottery-config.ts 算生效风格并传入**

顶部加 import：

```ts
import { resolveStyle, DEFAULT_AVATAR_STYLE } from './avatar-styles';
```

把 `const { cardList, colCount, rowCount } = buildCards(people);` 换成：

```ts
const avatarStyle = userConfig?.avatarStyle ?? DEFAULT_AVATAR_STYLE;
const autoDowngrade = userConfig?.avatarAutoDowngrade ?? false;
const effectiveStyle = resolveStyle(avatarStyle, people.length, autoDowngrade);
const { cardList, colCount, rowCount } = buildCards(people, effectiveStyle);
```

- [ ] **Step 8: 跑相关单测 + type-check + lint**

Run: `pnpm test config-store lottery-config-users && pnpm type-check && pnpm lint`
Expected: 全绿。`lottery-config-users.test.ts` 的 `/^data:image\/svg\+xml/` 断言对 letter 头像仍匹配。

- [ ] **Step 9: 全量单测确认无连带破坏**

Run: `pnpm test`
Expected: 全绿（lottery-config 默认 fun-emoji 会在导入时生成 DiceBear 头像，确认不报错、不显著拖慢）。

- [ ] **Step 10: 提交**

```bash
git add src/views/lottery/core/config-store.ts src/views/lottery/core/config-store.test.ts src/views/lottery/core/lottery-config-users.ts src/views/lottery/core/lottery-config-users.test.ts src/views/lottery/core/lottery-config.ts
git commit -m "$(printf '配置加头像风格字段，buildCards 按生效风格生成\n\nUserLotteryConfig 加 avatarStyle/avatarAutoDowngrade（可选、带校验，不进\nconfigHash 故换风格不清进度）；lottery-config 用 resolveStyle 算生效风格\n（默认 fun-emoji、开关+大名单降级）传入 buildCards。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## Task 3: 配置面板 UI + E2E

**Files:**
- Modify: `src/views/lottery/components/LotteryConfigPanel.tsx`
- Modify: `src/views/lottery/components/lottery-config-panel.scss`
- Modify: `e2e/lottery.spec.ts`

- [ ] **Step 1: 面板 import + state（LotteryConfigPanel.tsx）**

顶部加 import：

```ts
import { AVATAR_STYLES, DEFAULT_AVATAR_STYLE, AVATAR_HEAVY_WARN, generateAvatarFor } from '../core/avatar-styles'
```

组件内、其它 useState 附近加（`loadUserConfig()` 本文件已用到，可复用其结果；此处直接再调一次，简单直观）：

```ts
  const savedConfig = loadUserConfig()
  const [avatarStyle, setAvatarStyle] = useState(savedConfig?.avatarStyle ?? DEFAULT_AVATAR_STYLE)
  const [avatarAutoDowngrade, setAvatarAutoDowngrade] = useState(savedConfig?.avatarAutoDowngrade ?? false)
```

- [ ] **Step 2: buildConfig 写入两字段**

`buildConfig()` 的 return 对象里，`roster: ...` 之后加：

```ts
      avatarStyle,
      ...(avatarAutoDowngrade ? { avatarAutoDowngrade: true } : {}),
```

- [ ] **Step 3: 加「头像风格」区（JSX）**

在「背景音乐」`</section>` 之后插入：

```tsx
      <section>
        <h3>头像风格</h3>
        <p className="field-hint">没自带头像时的默认生成款。点选即换，保存后生效（不影响已抽进度）。</p>
        <div className="avatar-styles">
          {AVATAR_STYLES.map(s => (
            <button
              key={s.id}
              type="button"
              className={'avatar-style-option' + (avatarStyle === s.id ? ' selected' : '')}
              aria-pressed={avatarStyle === s.id}
              onClick={() => setAvatarStyle(s.id)}
            >
              <img src={generateAvatarFor(rosterNames[0] || '示', s.id)} alt="" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        {AVATAR_STYLES.find(s => s.id === avatarStyle)?.heavy && rosterNames.length > AVATAR_HEAVY_WARN && (
          <p className="perf-warning">
            {avatarAutoDowngrade
              ? `当前 ${rosterNames.length} 人较多，抽奖时会自动改用轻量首字头像（这里仍显示你选的风格）。`
              : `当前 ${rosterNames.length} 人用「${AVATAR_STYLES.find(s => s.id === avatarStyle)?.label}」头像可能卡顿，建议换轻量风格，或打开下方自动降级。`}
          </p>
        )}
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={avatarAutoDowngrade}
            onChange={e => setAvatarAutoDowngrade(e.target.checked)}
          />
          <span>大名单自动用轻量头像</span>
        </label>
      </section>
```

- [ ] **Step 4: scss 样式（lottery-config-panel.scss）**

文件末尾追加：

```scss
.avatar-styles {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 8px 0;
}
.avatar-style-option {
  background: none;
  border: 1px solid rgba(var(--accent-light-rgb), 0.25);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-bright);
  cursor: pointer;

  img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    object-fit: contain;
    background: rgba(0, 0, 0, 0.2);
  }
  span { font-size: 12px; }
  &.selected {
    border-color: var(--header-color);
    box-shadow: 0 0 0 1px var(--header-color);
  }
}
```

- [ ] **Step 5: type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: 通过。

- [ ] **Step 6: 写 E2E（e2e/lottery.spec.ts）**

在文件末尾 `test.describe('浏览器兼容性降级', ...)` 之前插入：

```ts
test.describe('头像风格设置', () => {
  test('选风格保存后持久化，不清空进度', async ({ page }) => {
    await gotoFresh(page)
    await drawOneRound(page)
    await closeBanner(page)
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')

    await page.locator('.config-btn').click()
    await page.locator('.avatar-style-option:has-text("机器人")').click()
    await page.locator('.panel-actions .primary').click() // 换风格不改 hash，无确认框
    await page.waitForTimeout(3500)

    // 进度仍在（换头像不清进度）
    await expect(page.locator('.prize-item-count-text').last()).toHaveText('10/20')
    // 风格已持久化
    await page.locator('.config-btn').click()
    await expect(page.locator('.avatar-style-option:has-text("机器人")')).toHaveClass(/selected/)
  })

  test('大名单选重风格出软提示；开自动降级则实际用轻量', async ({ page }) => {
    const bigRoster = Array.from({ length: 600 }, (_, i) => '选手' + i)
    // 600 人 + bottts + 不降级：出提示
    await page.goto('/')
    await page.evaluate((roster) => {
      localStorage.removeItem('___lottery___')
      localStorage.setItem('___lottery_countdown___', 'off')
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1, headerTitle: '压测', prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
        roster, avatarStyle: 'bottts',
      }))
    }, bigRoster)
    await page.reload()
    await page.waitForTimeout(4000)
    await page.locator('.config-btn').click()
    await expect(page.locator('.perf-warning:has-text("可能卡顿")')).toBeVisible()

    // 600 人 + bottts + 开降级：第一张卡片头像是轻量（含 linearGradient），不是 bottts
    await page.evaluate((roster) => {
      localStorage.setItem('___lottery_config___', JSON.stringify({
        version: 1, headerTitle: '压测', prizes: [{ name: '一等奖', count: 1, everyTimeGet: 1 }],
        roster, avatarStyle: 'bottts', avatarAutoDowngrade: true,
      }))
    }, bigRoster)
    await page.reload()
    await page.waitForTimeout(4000)
    const src = await page.locator('.element .card-avatar').first().getAttribute('src')
    expect(src).toContain('linearGradient')
  })
})
```

- [ ] **Step 7: 跑全套 E2E**

首选直接跑（8080 空闲时）：
```bash
FORCE_COLOR=1 pnpm e2e
```
Expected: 全部用例通过（含新 2 个头像用例）。

**若 8080 被本机其它项目占用**（`pnpm e2e` 会静默复用错的 server → 假绿/超时），先建一个临时 8090 配置再跑（不改提交的 playwright.config.ts）：
```bash
cat > /tmp/pw-8090.config.ts <<'EOF'
import { defineConfig, devices } from '@playwright/test'
const ROOT = process.cwd()
export default defineConfig({
  testDir: `${ROOT}/e2e`, fullyParallel: false, workers: 1, timeout: 60_000, reporter: 'list',
  use: { baseURL: 'http://localhost:8090', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'pnpm exec vite --port 8090 --host', cwd: ROOT, url: 'http://localhost:8090', reuseExistingServer: false, timeout: 60_000 },
})
EOF
FORCE_COLOR=1 pnpm exec playwright test --config /tmp/pw-8090.config.ts
```
Expected: 全部用例通过。

- [ ] **Step 8: 目视确认（真实浏览器）**

起 `vite --port 8090`，浏览器打开：确认配置面板「头像风格」区四个预览正常、选中态、默认卡片墙是 fun-emoji、切 bottts 保存后卡片变机器人且进度未清。截图留证。

- [ ] **Step 9: 提交**

```bash
git add src/views/lottery/components/LotteryConfigPanel.tsx src/views/lottery/components/lottery-config-panel.scss e2e/lottery.spec.ts
git commit -m "$(printf '配置面板加头像风格选择器 + 大名单提示/降级\n\n四风格带预览可选（默认 fun-emoji），选中即换、保存生效不清进度；\n重风格+大名单出软提示，配可选自动降级开关。补 E2E（持久化/提示/降级）。\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

## 收尾

三个提交后：`pnpm test` + 临时 8090 全套 E2E + `pnpm build` 应全绿；主包 gzip 约 +37KB（DiceBear）。默认 fun-emoji：老用户与默认名单更新后头像从首字变 emoji（有意的全局默认变更）。
