# Plan 009: IndexedDB 写入以事务提交为准，并合并重复封装

> **执行说明**：按步骤执行。每一步都要运行验证命令，确认结果符合预期后再进入下一步。遇到“STOP 条件”里的情况，停下来报告，不要自行发挥。完成后更新 `plans/README.md` 里本计划的状态行；如果是审阅者派你来执行，并说明由他们维护索引，则不用更新。
>
> **漂移检查（先运行）**：`git diff --stat a9634fb..HEAD -- src/views/lottery/core/image-store.ts src/views/lottery/core/lottery-music-store.ts`
> 如果范围内的文件在计划写完后有改动，先对照“现状”里的摘录和实际代码；对不上就按 STOP 条件处理。

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a9634fb`, 2026-11-07

## Why this matters

奖品图和背景音乐存在 IndexedDB 里。现在的封装在**请求**成功时就返回成功，而事务还没提交。如果事务在提交阶段中止（例如存储配额不足），调用方已经收到成功：

- 上传音乐后界面提示“背景音乐已更新”，同步标记也被置为“有自定义音乐”，但文件没存进去。
- 配置保存时会写进一个指向不存在图片的 `idb:` 引用。

这一条是读代码得出的结论，没有在真实浏览器里复现配额中止。修复本身很小：等 `transaction.oncomplete` 再返回成功。顺带把两份几乎一模一样的封装合成一份。

## Current state

`src/views/lottery/core/image-store.ts:9-31`：

```ts
let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}
```

`src/views/lottery/core/lottery-music-store.ts:9-33` 是同样的代码，只有 `DB_NAME`、`STORE` 不同。音乐仓的注释说明了分库原因：“与图片仓分库，避免被 gcImages 误删”，所以**两个数据库名必须保持不变**。

`lottery-music-store.ts` 的 `putMusic` 在写入成功后才设置同步标记：

```ts
export async function putMusic(dataUrl: string): Promise<void> {
  await withStore('readwrite', store => store.put(dataUrl, KEY))
  localStorage.setItem(FLAG_KEY, '1')
}
```

还有一个小问题：`openDb` 失败后会把被拒绝的 Promise 永久缓存，之后每次调用都直接失败，直到刷新页面。

约定和测试：

- 这两个文件不用分号，注释用中文。
- 测试环境通过 `vite.config.ts` 的 `setupFiles: ['fake-indexeddb/auto']` 提供 IndexedDB。
- 现有测试 `image-store.test.ts`、`lottery-music-store.test.ts` 必须继续通过。
- `e2e/reliability.spec.ts` 里「奖品图片写入失败保留原配置与进度」通过把 `IDBObjectStore.prototype.put` 改成同步抛错来模拟失败。新代码在这种情况下也必须 reject。

## Commands you will need

| 用途 | 命令 | 成功时的结果 |
|---|---|---|
| 类型检查 | `pnpm type-check` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| 相关单测 | `pnpm exec vitest run src/views/lottery/core/idb-kv.test.ts src/views/lottery/core/image-store.test.ts src/views/lottery/core/lottery-music-store.test.ts` | 全部通过 |
| 全部单测 | `pnpm test` | 全部通过 |
| 相关 E2E | `pnpm e2e e2e/reliability.spec.ts e2e/storage.spec.ts` | 全部通过，独占端口 18180 |
| 全量 E2E | `pnpm e2e` | 全部通过，约 7–8 分钟 |

## Scope

**In scope**（只能修改这些文件）：
- `src/views/lottery/core/idb-kv.ts`（新建）
- `src/views/lottery/core/idb-kv.test.ts`（新建）
- `src/views/lottery/core/image-store.ts`
- `src/views/lottery/core/lottery-music-store.ts`
- `plans/README.md`（只改本计划的状态行）

**Out of scope**：
- 数据库名、object store 名、键名、数据库版本号：都不能变，否则用户已保存的图片和音乐会丢。
- `getManyImages`、`gcImages` 的逐条读写方式：本计划不改成批量事务。
- 调用方（`config-images.ts`、`LotteryConfigPanel.tsx` 等）。

## Git workflow

- 分支：`advisor/009-idb-commit-semantics`
- 提交信息用中文并带前缀，例如 `fix: IndexedDB 写入等事务提交后才算成功`
- 本仓库要求每个改动端到端验证后再提交。
- 不要 push，也不要开 PR，除非操作者要求。

## Steps

### Step 1: 先写失败的单测

新建 `src/views/lottery/core/idb-kv.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { createKeyValueStore } from './idb-kv'

const withStore = createKeyValueStore('idb-kv-test', 'items')

describe('createKeyValueStore', () => {
  it('事务提交后返回请求结果', async () => {
    await withStore('readwrite', store => store.put('v1', 'k1'))
    expect(await withStore<string | undefined>('readonly', store => store.get('k1'))).toBe('v1')
  })

  it('请求成功但事务随后中止时 reject，数据没有写入', async () => {
    await expect(withStore('readwrite', store => {
      const req = store.put('v2', 'aborted')
      req.addEventListener('success', () => store.transaction.abort())
      return req
    })).rejects.toBeTruthy()
    expect(await withStore<string | undefined>('readonly', store => store.get('aborted'))).toBeUndefined()
  })

  it('回调同步抛错时 reject', async () => {
    await expect(withStore('readwrite', () => { throw new DOMException('quota', 'QuotaExceededError') })).rejects.toBeTruthy()
  })
})
```

**Verify**：`pnpm exec vitest run src/views/lottery/core/idb-kv.test.ts` → 失败（模块不存在）。

### Step 2: 实现共享封装

新建 `src/views/lottery/core/idb-kv.ts`：

```ts
// IndexedDB 单 store 键值仓的最小封装，图片仓和音乐仓共用。
// 写入以事务提交为准：请求成功后事务仍可能因配额等原因中止，那时数据并没有写进去。
export function createKeyValueStore(dbName: string, storeName: string) {
  let dbPromise: Promise<IDBDatabase> | null = null

  function openDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      const opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName, 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore(storeName)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      // 打开失败不缓存，下次调用可以重试
      opening.catch(() => { if (dbPromise === opening) dbPromise = null })
      dbPromise = opening
    }
    return dbPromise
  }

  return function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(db => new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode)
      const req = fn(tx.objectStore(storeName))
      tx.oncomplete = () => resolve(req.result)
      tx.onabort = () => reject(tx.error ?? req.error ?? new DOMException('IndexedDB 事务已中止', 'AbortError'))
    }))
  }
}
```

说明：

- `fn` 同步抛错时，Promise 执行器会捕获并 reject，这和原来的行为一致。
- 先创建请求再挂事务监听是安全的，事件总是异步触发。
- 请求出错且没有被处理时，事务会中止并触发 `onabort`，所以不需要单独挂 `req.onerror`。

**Verify**：`pnpm exec vitest run src/views/lottery/core/idb-kv.test.ts` → 3 项通过。

### Step 3: 两个仓改用共享封装

`image-store.ts`：删除 `let dbPromise`、`openDb`、`withStore` 三段，换成：

```ts
import { createKeyValueStore } from './idb-kv'

const withStore = createKeyValueStore(DB_NAME, STORE)
```

`import` 放在文件顶部注释之后、常量之前。`DB_NAME`、`STORE`、`REF_PREFIX` 常量保留，其余函数（`putImage`、`getImage` 等）一行不改。

`lottery-music-store.ts` 做同样的替换，保留 `DB_NAME`、`STORE`、`KEY`、`FLAG_KEY`。

**Verify**：`pnpm exec vitest run src/views/lottery/core/idb-kv.test.ts src/views/lottery/core/image-store.test.ts src/views/lottery/core/lottery-music-store.test.ts` → 全部通过；`grep -c "indexedDB.open" src/views/lottery/core/image-store.ts src/views/lottery/core/lottery-music-store.ts` → 两个文件都输出 `0`。

### Step 4: 端到端回归

**Verify**：`pnpm e2e e2e/reliability.spec.ts e2e/storage.spec.ts` → 全部通过。重点看「奖品图片写入失败保留原配置与进度」和「含奖品图的抽奖保存轻量进度」。

### Step 5: 全量验证

**Verify**：依次运行 `pnpm type-check`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` → 全部通过。

## Test plan

- `idb-kv.test.ts`：正常提交、请求成功后事务中止、回调同步抛错。
- 现有 `image-store.test.ts`、`lottery-music-store.test.ts` 作为回归。
- 现有 `e2e/reliability.spec.ts`、`e2e/storage.spec.ts` 作为端到端回归。

## Done criteria

- [ ] `pnpm type-check` 退出码为 0
- [ ] `pnpm lint` 退出码为 0
- [ ] `pnpm test` 退出码为 0，`idb-kv.test.ts` 的 3 项存在且通过
- [ ] `pnpm e2e` 退出码为 0
- [ ] `grep -n "req.onsuccess" src/views/lottery/core/image-store.ts src/views/lottery/core/lottery-music-store.ts` 没有输出
- [ ] `grep -n "tx.oncomplete" src/views/lottery/core/idb-kv.ts` 有 1 行输出
- [ ] `git status --short` 只包含 Scope 列出的文件
- [ ] `plans/README.md` 状态行已更新

## STOP conditions

- “现状”里的摘录和实际代码对不上。
- fake-indexeddb 不支持在 `success` 回调里中止事务，导致第二个用例无法按预期运行：报告实际行为，不要删掉这个用例。
- 替换后现有图片或音乐测试失败，并且原因不是事务时序。
- 需要修改数据库名、版本号或调用方才能通过。

## Maintenance notes

- 以后需要新的 IndexedDB 键值仓时，复用 `createKeyValueStore`，并使用新的数据库名，避免被 `gcImages` 误删。
- 如果要升级数据库版本或增加 object store，`openDb` 里的 `onupgradeneeded` 需要按版本号迁移，不能直接改成 2。
- `getManyImages` 和 `gcImages` 仍是每条一个事务，图片多时较慢。这是独立的性能问题，本计划没有处理。
