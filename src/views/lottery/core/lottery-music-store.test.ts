import { describe, it, expect, beforeEach } from 'vitest'
import { hasCustomMusic, putMusic, getMusic, clearMusic } from './lottery-music-store'

describe('lottery-music-store', () => {
  beforeEach(async () => {
    localStorage.clear()
    await clearMusic()
  })

  it('初始无自定义音乐', () => {
    expect(hasCustomMusic()).toBe(false)
  })

  it('存入后可取回，且同步标记置位', async () => {
    await putMusic('data:audio/mpeg;base64,AAAA')
    expect(hasCustomMusic()).toBe(true)
    expect(await getMusic()).toBe('data:audio/mpeg;base64,AAAA')
  })

  it('清除后取不到且标记复位', async () => {
    await putMusic('data:audio/mpeg;base64,AAAA')
    await clearMusic()
    expect(hasCustomMusic()).toBe(false)
    expect(await getMusic()).toBeNull()
  })
})
