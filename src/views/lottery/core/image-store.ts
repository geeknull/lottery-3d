// IndexedDB 图片仓：上传的图片二进制（dataURL）存这里，配置只存 `idb:<id>` 引用。
// 把大体积图片移出 localStorage，避免配置/进度因超过 ~5MB 配额而静默写入失败。

const DB_NAME = 'lottery-images'
const STORE = 'images'
const REF_PREFIX = 'idb:'

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

// 是否为 idb 引用（区别于 http URL、data URL、空）；类型守卫，便于 filter 后窄化为 string
export function isImageRef(s: string | undefined | null): s is string {
  return typeof s === 'string' && s.startsWith(REF_PREFIX)
}

// 生成唯一图片 id。crypto.randomUUID 仅在 secure context（HTTPS/localhost）+ 较新浏览器可用，
// file:// 或老浏览器下降级（图片 id 只需唯一，不需要密码学强度）。
function genImageId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) {
    return c.randomUUID()
  }
  if (c?.getRandomValues) {
    const a = new Uint8Array(16)
    c.getRandomValues(a)
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(16)}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`
}

// 存入一张图片，返回它的 `idb:<id>` 引用
export async function putImage(dataUrl: string): Promise<string> {
  const ref = REF_PREFIX + genImageId()
  await withStore('readwrite', store => store.put(dataUrl, ref))
  return ref
}

// 按引用取回 dataURL，取不到（非引用 / 不存在）返回 null
export async function getImage(ref: string): Promise<string | null> {
  if (!isImageRef(ref)) {
    return null
  }
  const v = await withStore<string | undefined>('readonly', store => store.get(ref))
  return v ?? null
}

// 批量取回：跳过非引用，缺失的不放进结果
export async function getManyImages(refs: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const ref of refs) {
    if (isImageRef(ref)) {
      const v = await getImage(ref)
      if (v != null) {
        map.set(ref, v)
      }
    }
  }
  return map
}

export async function deleteImage(ref: string): Promise<void> {
  if (!isImageRef(ref)) {
    return void 0
  }
  await withStore('readwrite', store => store.delete(ref))
}

// 垃圾回收：删除所有不在 usedRefs 里的图片（配置不再引用的）
export async function gcImages(usedRefs: string[]): Promise<void> {
  const used = new Set(usedRefs.filter(isImageRef))
  const keys = await withStore<IDBValidKey[]>('readonly', store => store.getAllKeys())
  for (const key of keys) {
    if (typeof key === 'string' && !used.has(key)) {
      await withStore('readwrite', store => store.delete(key))
    }
  }
}
