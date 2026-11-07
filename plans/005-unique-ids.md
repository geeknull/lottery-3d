# Plan 005: 名单和奖项的 ID 保证唯一

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/lottery-config-users.ts src/views/lottery/core/lottery-config-users.test.ts src/views/lottery/core/lottery-config.ts src/views/lottery/core/lottery-config.test.ts e2e/reliability.spec.ts`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none（和 003、007 改同一个文件，不要并行执行）
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

卡片和奖项的 ID 由名字加序号生成，但没有检查序号结果是否和别的名字重复。名单 `张三、张三、张三-2` 实测得到 `['张三', '张三-2', '张三-2']`，只有 2 个不同的 ID。

抽奖逻辑全部按 ID 判断，所以其中一人中奖时，另一人会被当成已中奖，静默移出奖池。公平验证遇到重复 ID 会直接失败，整场都验证不过。奖项的 ID 规则相同，重复时后一个奖项选不中。

## Current state

`src/views/lottery/core/lottery-config-users.ts:21-37`：

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
```

`src/views/lottery/core/lottery-config.ts:51-68`，奖项用同样的规则：

```ts
// 重名奖项 id 加序号去重（与卡片同规则）
const prizeNameCount = new Map<string, number>();
const prizeList: Prize[] = prizeConfigs.map(p => {
  const seen = prizeNameCount.get(p.name) ?? 0;
  prizeNameCount.set(p.name, seen + 1);
  return {
    count: p.count,
    countRemain: p.count,
    everyTimeGet: p.everyTimeGet,
    presentation: p.presentation ?? 'standard',
    name: p.name,
    detail: p.name + '商品',
    img: p.img ?? '',
    id: seen === 0 ? p.name : `${p.name}-${seen + 1}`,
    round: 0,
    cardListWin: [],
  };
});
```

`src/views/lottery/core/fairness-package.ts:111`，验证遇到重复 ID 时失败：

```ts
  if (names.size !== pkg.roster.length || prizes.size !== pkg.prizes.length) return fail('名单或奖项 ID 重复')
```

硬性约束：

- **没有撞车的名单，ID 必须和现在完全一样。** 存档和验证文件都按 ID 保存，`lottery-config-users.test.ts` 已断言 `['张三', '张三-2', '张三-3']`。新规则只能在旧规则撞车时才生效。
- `configHash` 只用名字，不用 ID，不受影响。
- 这两个文件都用分号。注释用中文。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 单文件单测 | `pnpm exec vitest run src/views/lottery/core/lottery-config-users.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 单文件 E2E | `pnpm e2e e2e/reliability.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/lottery-config-users.ts`
- `src/views/lottery/core/lottery-config-users.test.ts`
- `src/views/lottery/core/lottery-config.ts`（只改奖项 ID 那段和 import）
- `src/views/lottery/core/lottery-config.test.ts`
- `e2e/reliability.spec.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- `src/views/lottery/core/fairness-package.ts`：重复 ID 校验要保留。
- `src/views/lottery/core/config-restore.ts`：不要写迁移逻辑。
- 配置校验：不要禁止 `张三-2` 这样的名字。

## Git workflow

- 分支：`advisor/005-unique-ids`
- 提交信息用中文并带前缀，例如 `fix: 避免名单和奖项生成重复 ID`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

在 `lottery-config-users.test.ts` 的 `describe('buildCards')` 里加：

```ts
  it.each([
    [['张三', '张三', '张三-2'], ['张三', '张三-2', '张三-2-2']],
    [['张三-2', '张三', '张三'], ['张三-2', '张三', '张三-3']],
    [['张三-2', '张三', '张三', '张三'], ['张三-2', '张三', '张三-3', '张三-4']],
  ])('序号和其他名字撞车时 ID 仍然唯一：%j', (names, ids) => {
    const { cardList } = buildCards(names.map(name => ({ name })), 'letter')
    expect(cardList.map(c => c.id)).toEqual(ids)
    expect(cardList.map(c => c.name)).toEqual(names)
  })
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config-users.test.ts` → 新用例失败，原有用例通过。

### Step 2: 加 ID 生成函数并用在卡片上

在 `lottery-config-users.ts` 里 `buildCards` 之前加：

```ts
// 按名字生成唯一 ID。没有撞车时和原规则一致（张三、张三-2、张三-3），
// 存档和验证文件都按 ID 保存，这条不能变。序号结果和别的名字相同时才继续往后找。
export function createIdAllocator(): (name: string) => string {
  const nameCount = new Map<string, number>();
  const usedIds = new Set<string>();
  return name => {
    const seen = nameCount.get(name) ?? 0;
    nameCount.set(name, seen + 1);
    let id = seen === 0 ? name : `${name}-${seen + 1}`;
    for (let suffix = seen + 2; usedIds.has(id); suffix++) {
      id = `${name}-${suffix}`;
    }
    usedIds.add(id);
    return id;
  };
}
```

修改 `buildCards`：删除 `nameCount`、`seen` 相关的 3 行，改成：

```ts
  const colCount = calcColCount(people.length);
  const allocateId = createIdAllocator();
  const cardList: Card[] = people.map((person, i) => ({
    name: person.name,
    id: allocateId(person.name),
    avatar: person.avatar ?? generateAvatarFor(person.name, styleId),
    index: i,
    row: Math.floor(i / colCount) + 1,
    col: (i % colCount) + 1,
  }));
```

手算核对：`张三、张三、张三-2`：第 3 个名字 `seen=0`，`id=张三-2` 已占用，`suffix` 从 2 开始，得到 `张三-2-2`。`张三-2、张三、张三`：第 3 个 `seen=1`，`id=张三-2` 已占用，`suffix` 从 3 开始，得到 `张三-3`。

**Verify**：`pnpm exec vitest run src/views/lottery/core/lottery-config-users.test.ts` → 全部通过。

### Step 3: 奖项使用同一个函数

修改 `lottery-config.ts`：

1. 第 1 行改成 `import { buildCards, createIdAllocator, defaultPeople } from './lottery-config-users';`
2. 奖项部分改成：

```ts
// 重名奖项 id 加序号去重（与卡片同规则）
const allocatePrizeId = createIdAllocator();
const prizeList: Prize[] = prizeConfigs.map(p => ({
  count: p.count,
  countRemain: p.count,
  everyTimeGet: p.everyTimeGet,
  presentation: p.presentation ?? 'standard',
  name: p.name,
  detail: p.name + '商品',
  img: p.img ?? '',
  id: allocatePrizeId(p.name),
  round: 0,
  cardListWin: [],
}));
```

在 `lottery-config.test.ts` 末尾加：

```ts
describe('ID 唯一性', () => {
  it('奖项序号撞车时 ID 仍然唯一', async () => {
    const { saveUserConfig } = await import('./config-store')
    saveUserConfig({
      version: 1, headerTitle: '撞车',
      prizes: ['奖', '奖', '奖-2'].map(name => ({ name, count: 1, everyTimeGet: 1 })),
      roster: ['甲', '乙', '丙'],
    })
    vi.resetModules()
    const { default: configured } = await import('./lottery-config')
    expect(configured.prizeList.map(p => p.id)).toEqual(['奖', '奖-2', '奖-2-2'])
  })

  it('名单序号撞车时不误伤他人，公平验证通过', async () => {
    const { saveUserConfig } = await import('./config-store')
    saveUserConfig({
      version: 1, headerTitle: '撞车',
      prizes: [{ name: '大奖', count: 3, everyTimeGet: 1 }],
      roster: ['张三', '张三', '张三-2'],
    })
    vi.resetModules()
    const { default: configured } = await import('./lottery-config')
    const { getRandomCard } = await import('./lottery-algorithm')
    const { ensureSeedCommit, verifyCurrent } = await import('./lottery-fairness')
    await ensureSeedCommit()
    getRandomCard(configured.prizeList[0])
    expect(configured.cardListRemainAll).toHaveLength(2)
    getRandomCard(configured.prizeList[0])
    getRandomCard(configured.prizeList[0])
    expect(configured.cardListWinAll).toHaveLength(3)
    expect((await verifyCurrent()).ok).toBe(true)
  })
})
```

**Verify**：`pnpm test` → 全部通过。

### Step 4: 加端到端回归

在 `e2e/reliability.spec.ts` 末尾加：

```ts
test('名单序号撞车时全部人都能中奖，公平验证通过', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.removeItem('___lottery___')
    localStorage.setItem('___lottery_countdown___', 'off')
    localStorage.setItem('___lottery_config___', JSON.stringify({
      version: 1, headerTitle: 'ID 回归',
      prizes: [{ name: '一等奖', count: 3, everyTimeGet: 3 }],
      roster: ['张三', '张三', '张三-2'],
    }))
  })
  await page.reload()
  await page.waitForTimeout(3500)
  await drawOneRound(page)
  await closeBanner(page)
  await expect(page.locator('.element.prize')).toHaveCount(3)
  await page.locator('.fairness-btn').click()
  await page.getByRole('button', { name: '立即自验证', exact: true }).click()
  await expect(page.locator('.verify-result.ok')).toContainText('已复算 1 轮及全部操作')
})
```

**Verify**：`pnpm e2e e2e/reliability.spec.ts` → 全部通过，包含这项新用例。

### Step 5: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `lottery-config-users.test.ts`：3 种撞车顺序；原有 `['张三', '张三-2', '张三-3']` 用例证明没有撞车时 ID 不变。
- `lottery-config.test.ts`：奖项撞车、名单撞车后的抽奖和验证。
- `e2e/reliability.spec.ts`：真实抽奖和公平自验证。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，新用例存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -n "seen === 0" src/views/lottery/core/lottery-config.ts` 没有输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- 现有测试 `重名自动加序号区分 id，name 保持原样` 失败：说明破坏了 ID 兼容性，立刻停下。
- 现有的存档恢复或公平验证用例失败。

## Maintenance notes

- 已经用撞车名单开始的旧场次，存档里的 ID 是重复的，这份存档本来就有问题，本计划不迁移。旧的 `张三-2` 恢复后会对应第二张卡，第三张卡变成 `张三-2-2`。
- ID 的生成顺序现在依赖名单顺序，这和原来一样。不要在生成 ID 之前排序。
- 计划 008 会把名单 ID 写进种子承诺，所以本计划要先完成。
- 计划 013 如果引入工号，ID 规则要重新设计，但必须保留无工号名单的现有规则。
