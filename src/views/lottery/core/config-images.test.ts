import { describe, it, expect, beforeEach } from 'vitest'
import { persistConfigImages, inlineConfigImages } from './config-images'
import { getImage, isImageRef, gcImages } from './image-store'
import type { UserLotteryConfig } from './config-store'

const DATA_IMG = 'data:image/png;base64,AAAA'

function baseConfig(imgs: (string | undefined)[]): UserLotteryConfig {
  return {
    version: 1,
    headerTitle: 't',
    prizes: imgs.map((img, i) => ({ name: `奖${i}`, count: 1, everyTimeGet: 1, img })),
    roster: ['张三', '李四'],
  }
}

beforeEach(async () => {
  await gcImages([]) // 清空图片仓
})

describe('persistConfigImages', () => {
  it('dataURL 奖品图移入 idb，img 换成 idb: 引用', async () => {
    const out = await persistConfigImages(baseConfig([DATA_IMG]))
    const ref = out.prizes[0].img!
    expect(isImageRef(ref)).toBe(true)
    expect(await getImage(ref)).toBe(DATA_IMG)
  })

  it('http URL 与空图保持不变', async () => {
    const out = await persistConfigImages(baseConfig(['http://x/a.png', undefined]))
    expect(out.prizes[0].img).toBe('http://x/a.png')
    expect(out.prizes[1].img).toBeUndefined()
  })

  it('已是 idb 引用的不重复存入', async () => {
    const out1 = await persistConfigImages(baseConfig([DATA_IMG]))
    const ref = out1.prizes[0].img
    const out2 = await persistConfigImages(out1)
    expect(out2.prizes[0].img).toBe(ref) // 引用不变
  })
})

describe('inlineConfigImages', () => {
  it('idb 引用还原成 dataURL（导出自包含）', async () => {
    const persisted = await persistConfigImages(baseConfig([DATA_IMG]))
    const inlined = await inlineConfigImages(persisted)
    expect(inlined.prizes[0].img).toBe(DATA_IMG)
  })

  it('无图片引用时原样返回', async () => {
    const cfg = baseConfig(['http://x/a.png'])
    expect(await inlineConfigImages(cfg)).toEqual(cfg)
  })
})

describe('persist → inline 往返', () => {
  it('一存一还原后奖品图与原始一致', async () => {
    const original = baseConfig([DATA_IMG, 'http://x/b.png', undefined])
    const roundtrip = await inlineConfigImages(await persistConfigImages(original))
    expect(roundtrip.prizes.map(p => p.img)).toEqual([DATA_IMG, 'http://x/b.png', undefined])
  })
})
