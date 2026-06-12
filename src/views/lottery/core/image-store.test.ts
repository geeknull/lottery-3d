import { describe, it, expect, beforeEach } from 'vitest'
import { putImage, getImage, getManyImages, deleteImage, gcImages, isImageRef } from './image-store'

const DATA_A = 'data:image/png;base64,AAAA'
const DATA_B = 'data:image/jpeg;base64,BBBB'

// 每个用例清空图片仓，避免 gc 等用例互相干扰
beforeEach(async () => {
  await gcImages([])
})

describe('isImageRef', () => {
  it('只认 idb: 前缀', () => {
    expect(isImageRef('idb:abc')).toBe(true)
    expect(isImageRef('http://x/a.png')).toBe(false)
    expect(isImageRef('data:image/png;base64,AA')).toBe(false)
    expect(isImageRef(undefined)).toBe(false)
    expect(isImageRef('')).toBe(false)
  })
})

describe('putImage / getImage', () => {
  it('存入返回 idb: 引用，按引用取回原 dataURL', async () => {
    const ref = await putImage(DATA_A)
    expect(isImageRef(ref)).toBe(true)
    expect(await getImage(ref)).toBe(DATA_A)
  })

  it('两次存入得到不同引用', async () => {
    const a = await putImage(DATA_A)
    const b = await putImage(DATA_B)
    expect(a).not.toBe(b)
    expect(await getImage(a)).toBe(DATA_A)
    expect(await getImage(b)).toBe(DATA_B)
  })

  it('取非引用或不存在的引用返回 null', async () => {
    expect(await getImage('http://x/a.png')).toBeNull()
    expect(await getImage('idb:not-exist')).toBeNull()
  })
})

describe('getManyImages', () => {
  it('批量取回，跳过非引用，缺失的不入结果', async () => {
    const a = await putImage(DATA_A)
    const b = await putImage(DATA_B)
    const map = await getManyImages([a, b, 'http://x/a.png', 'idb:missing'])
    expect(map.size).toBe(2)
    expect(map.get(a)).toBe(DATA_A)
    expect(map.get(b)).toBe(DATA_B)
  })
})

describe('deleteImage', () => {
  it('删除后取回为 null', async () => {
    const ref = await putImage(DATA_A)
    await deleteImage(ref)
    expect(await getImage(ref)).toBeNull()
  })

  it('删非引用是无操作，不抛', async () => {
    await expect(deleteImage('http://x/a.png')).resolves.toBeUndefined()
  })
})

describe('gcImages', () => {
  it('删除未被引用的图片，保留仍在用的', async () => {
    const keep = await putImage(DATA_A)
    const drop = await putImage(DATA_B)
    await gcImages([keep, 'http://x/logo.png'])
    expect(await getImage(keep)).toBe(DATA_A)
    expect(await getImage(drop)).toBeNull()
  })
})
