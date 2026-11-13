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
