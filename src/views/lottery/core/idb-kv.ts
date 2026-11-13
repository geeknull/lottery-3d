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
