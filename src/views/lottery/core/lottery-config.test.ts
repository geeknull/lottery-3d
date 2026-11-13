import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LotteryConfig } from './lottery-config'

async function loadFresh() {
  vi.resetModules()
  localStorage.clear()
  const { default: lotteryConfig } = await import('./lottery-config')
  const { bus } = await import('./event-bus')
  return { lotteryConfig, bus }
}

let lotteryConfig: LotteryConfig
let bus: Awaited<ReturnType<typeof loadFresh>>['bus']

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  ;({ lotteryConfig, bus } = await loadFresh())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setLocalStorage 写入容错', () => {
  it('写入抛配额错误时不冒泡，并发 storage-error 事件', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => lotteryConfig.setLocalStorage()).not.toThrow()
    expect(onErr).toHaveBeenCalledTimes(1)
  })

  it('持续失败只提醒一次（不每轮刷屏）', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(onErr).toHaveBeenCalledTimes(1)
  })

  it('正常写入不报错、不发事件', () => {
    const onErr = vi.fn()
    bus.on('storage-error', onErr)
    expect(() => lotteryConfig.setLocalStorage()).not.toThrow()
    expect(onErr).not.toHaveBeenCalled()
    expect(localStorage.getItem('___lottery___')).toBeTruthy()
  })
})

describe('轻量进度与旧存档迁移', () => {
  it('旧配置默认简洁，改为隆重后仍恢复同一份进度与公平验证包', async () => {
    const { saveUserConfig } = await import('./config-store')
    const userConfig = {
      version: 1 as const, headerTitle: '节奏兼容',
      prizes: [{ name: '大奖', count: 2, everyTimeGet: 1 }], roster: ['甲', '乙', '丙'],
    }
    saveUserConfig(userConfig)
    vi.resetModules()
    const configured = (await import('./lottery-config')).default
    expect(configured.prizeList[0].presentation).toBe('standard')
    const { getRandomCard } = await import('./lottery-algorithm')
    const { ensureSeedCommit, createVerificationPackage } = await import('./lottery-fairness')
    await ensureSeedCommit()
    getRandomCard(configured.prizeList[0])
    const progress = localStorage.getItem('___lottery___')
    const verification = createVerificationPackage()
    saveUserConfig({ ...userConfig, prizes: [{ ...userConfig.prizes[0], presentation: 'ceremonial' }] })
    vi.resetModules()
    const reloaded = (await import('./lottery-config')).default
    expect(reloaded.prizeList[0].presentation).toBe('ceremonial')
    expect(reloaded.prizeList[0].countRemain).toBe(1)
    expect(reloaded.cardListWinAll.map(card => card.id)).toEqual(configured.cardListWinAll.map(card => card.id))
    expect(reloaded.rngState).toBe(configured.rngState)
    expect(localStorage.getItem('___lottery___')).toBe(progress)
    const { createVerificationPackage: reloadedPackage, verifyCurrent } = await import('./lottery-fairness')
    expect(reloadedPackage()).toEqual(verification)
    expect((await verifyCurrent()).ok).toBe(true)
  })

  it('恢复图片后的真实抽奖只保存 ID 与进度，不把图片写回 localStorage', async () => {
    const { putImage } = await import('./image-store')
    const { hydrateLotteryImages } = await import('./config-images')
    const { getRandomCard, voidWinner } = await import('./lottery-algorithm')
    const prize = lotteryConfig.prizeList[0]
    prize.img = await putImage('data:image/png;base64,aW1hZ2U=')
    await hydrateLotteryImages()
    expect(prize.img).toContain('data:image')
    const [winner] = getRandomCard(prize)
    voidWinner(prize.id, winner.id, false)
    getRandomCard(prize)

    const raw = localStorage.getItem('___lottery___')!
    expect(raw.includes('data:image')).toBe(false)
    expect(raw.length).toBeLessThan(100_000)
    const saved = JSON.parse(raw)
    expect(saved.version).toBe(2)
    expect(saved.cardListWinAll).toEqual(lotteryConfig.cardListWinAll.map(c => c.id))
    expect(saved.cardListExcluded).toEqual([winner.id])
    expect(saved.prizeList[0]).not.toHaveProperty('img')

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListWinAll.map(c => c.id)).toEqual(saved.cardListWinAll)
    expect(reloaded.cardListWinAll[0]).toBe(reloaded.cardList.find(c => c.id === saved.cardListWinAll[0]))
    expect(reloaded.cardListExcluded.map(c => c.id)).toEqual([winner.id])
    expect(reloaded.rngState).toBe(saved.rngState)
    expect(reloaded.drawLog).toEqual(saved.drawLog)
  })

  it('旧的完整对象存档仍恢复进度，并在下次保存时迁移为 ID', async () => {
    const { getRandomCard } = await import('./lottery-algorithm')
    const [winner] = getRandomCard(lotteryConfig.prizeList[0])
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    delete saved.version
    Object.assign(saved, {
      prizeList: lotteryConfig.prizeList.map(prize => ({
        ...prize,
        // 旧版作废后撤销重复归还名额，迁移不能因此丢弃其它有效进度。
        countRemain: prize.id === lotteryConfig.prizeList[0].id ? prize.count + 1 : prize.countRemain,
        img: 'data:image/png;base64,old-prize-image',
        cardListWin: prize.cardListWin.map(card => ({ ...card, avatar: 'old-avatar', name: 'old-name' })),
      })),
      cardListWinAll: lotteryConfig.cardListWinAll,
      cardListRemainAll: lotteryConfig.cardListRemainAll,
      cardListExcluded: [],
    })
    localStorage.setItem('___lottery___', JSON.stringify(saved))

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListWinAll.map(c => c.id)).toEqual([winner.id])
    expect(reloaded.cardListWinAll[0]).toBe(reloaded.getUserById(winner.id))
    expect(reloaded.prizeList[0].countRemain).toBe(lotteryConfig.prizeList[0].countRemain)
    expect(reloaded.prizeList[0].cardListWin[0]).toBe(reloaded.getUserById(winner.id))
    expect(reloaded.prizeList[0].cardListWin[0].avatar).not.toBe('old-avatar')
    expect(reloaded.prizeList[0].cardListWin[0].name).not.toBe('old-name')
    expect(reloaded.prizeList[0].img).not.toContain('old-prize-image')
    reloaded.setLocalStorage()
    const migrated = localStorage.getItem('___lottery___')!
    expect(migrated.includes('data:image')).toBe(false)
    expect(JSON.parse(migrated).version).toBe(2)
  })

  it.each([
    ['legacy', 1, 0.5], ['legacy', 2, -0.5],
    ['v2', 1, 0.5], ['v2', 2, -0.5],
  ] as const)('已有小数奖项配置的 %s 存档抽 %i 轮后刷新保留中奖进度', async (format, draws, balance) => {
    const { saveUserConfig } = await import('./config-store')
    saveUserConfig({
      version: 1,
      headerTitle: '旧活动',
      prizes: [{ name: '奖项', count: 1.5, everyTimeGet: 1 }],
      roster: ['甲', '乙'],
    })
    vi.resetModules()
    const { default: configured } = await import('./lottery-config')
    const { getRandomCard } = await import('./lottery-algorithm')
    for (let round = 0; round < draws; round++) getRandomCard(configured.prizeList[0])
    expect(configured.prizeList[0].countRemain).toBe(balance)
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    if (format === 'legacy') {
      delete saved.version
      Object.assign(saved, {
        prizeList: configured.prizeList,
        cardListWinAll: configured.cardListWinAll,
        cardListRemainAll: configured.cardListRemainAll,
        cardListExcluded: configured.cardListExcluded,
      })
      localStorage.setItem('___lottery___', JSON.stringify(saved))
    }

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListWinAll.map(card => card.id)).toEqual(configured.cardListWinAll.map(card => card.id))
    expect(reloaded.prizeList[0].countRemain).toBe(balance)
    expect(reloaded.prizeList[0].round).toBe(draws)
    expect(reloaded.drawLog).toEqual(configured.drawLog)
    expect(reloaded.rngState).toBe(configured.rngState)
  })

  it.each(['remaining-card', 'prize-card', 'version'])('损坏存档 %s 不会让启动崩溃或只恢复部分进度', async corruption => {
    const { getRandomCard } = await import('./lottery-algorithm')
    getRandomCard(lotteryConfig.prizeList[0])
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    if (corruption === 'remaining-card') saved.cardListRemainAll = [null]
    if (corruption === 'prize-card') saved.prizeList[0].cardListWin = ['unknown-id']
    if (corruption === 'version') saved.version = 99
    localStorage.setItem('___lottery___', JSON.stringify(saved))

    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.cardListWinAll).toEqual([])
    expect(reloaded.cardListRemainAll).toEqual(reloaded.cardList)
    expect(reloaded.prizeList[0].countRemain).toBe(reloaded.prizeList[0].count)
    expect(reloaded.drawLog).toEqual([])
  })
})

describe('多窗口写入保护', () => {
  // 模拟另一个窗口写入了更新的进度
  function writeFromOtherWindow() {
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, revision: saved.revision + 1, marker: 'other-window' }))
  }

  it('每次保存递增版本', () => {
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(2)
  })

  it('其他窗口写入后不覆盖，并只提醒一次', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    writeFromOtherWindow()
    lotteryConfig.setLocalStorage()
    lotteryConfig.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).marker).toBe('other-window')
    expect(lotteryConfig.isProgressStale()).toBe(true)
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('收到 storage 事件时立即失效', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    writeFromOtherWindow()
    window.dispatchEvent(new StorageEvent('storage', { key: '___lottery___' }))
    expect(onStale).toHaveBeenCalledTimes(1)
  })

  it('其他窗口清空进度后本窗口失效', () => {
    lotteryConfig.setLocalStorage()
    localStorage.removeItem('___lottery___')
    expect(lotteryConfig.isProgressStale()).toBe(true)
  })

  it('无关键名的 storage 事件不会让本窗口失效', () => {
    const onStale = vi.fn()
    bus.on('progress-stale', onStale)
    lotteryConfig.setLocalStorage()
    window.dispatchEvent(new StorageEvent('storage', { key: '___lottery_sound___' }))
    expect(onStale).not.toHaveBeenCalled()
  })

  it('存档被拒绝恢复时，新场次仍能保存', async () => {
    lotteryConfig.setLocalStorage()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    localStorage.setItem('___lottery___', JSON.stringify({ ...saved, hash: 'changed', revision: 9 }))
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.isProgressStale()).toBe(false)
    reloaded.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(10)
  })

  it('没有 revision 的旧存档按 0 处理', async () => {
    lotteryConfig.setLocalStorage()
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    delete saved.revision
    localStorage.setItem('___lottery___', JSON.stringify(saved))
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    reloaded.setLocalStorage()
    expect(JSON.parse(localStorage.getItem('___lottery___')!).revision).toBe(1)
  })
})

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

describe('无法恢复的旧进度', () => {
  async function savedProgress() {
    const { getRandomCard } = await import('./lottery-algorithm')
    getRandomCard(lotteryConfig.prizeList[0])
    return JSON.parse(localStorage.getItem('___lottery___')!)
  }

  async function reloadWith(raw: string) {
    localStorage.setItem('___lottery___', raw)
    vi.resetModules()
    return (await import('./lottery-config')).default
  }

  it('配置指纹不符时备份原文，并且只提醒一次', async () => {
    const raw = JSON.stringify({ ...(await savedProgress()), hash: 'changed' })
    const reloaded = await reloadWith(raw)
    expect(JSON.parse(reloaded.getRejectedProgress()!)).toMatchObject({ reason: 'config-mismatch', raw })
    expect(reloaded.takeRejectedNotice()).toBe(true)
    expect(reloaded.takeRejectedNotice()).toBe(false)
    expect(reloaded.drawLog).toEqual([])
  })

  it('存档结构损坏时备份原因是 invalid-progress', async () => {
    const reloaded = await reloadWith(JSON.stringify({ ...(await savedProgress()), version: 99 }))
    expect(JSON.parse(reloaded.getRejectedProgress()!).reason).toBe('invalid-progress')
  })

  it('JSON 无法解析时备份原因是 invalid-json', async () => {
    const reloaded = await reloadWith('{broken')
    expect(JSON.parse(reloaded.getRejectedProgress()!)).toMatchObject({ reason: 'invalid-json', raw: '{broken' })
  })

  it('正常恢复时不产生备份，也不提醒', async () => {
    await savedProgress()
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.getRejectedProgress()).toBeNull()
    expect(reloaded.takeRejectedNotice()).toBe(false)
  })

  it('备份写入失败时启动不受影响，仍会提醒', async () => {
    const raw = JSON.stringify({ ...(await savedProgress()), hash: 'changed' })
    localStorage.setItem('___lottery___', raw)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === '___lottery_rejected___') throw new DOMException('quota', 'QuotaExceededError')
      return setItem.call(this, key, value)
    })
    vi.resetModules()
    const { default: reloaded } = await import('./lottery-config')
    expect(reloaded.takeRejectedNotice()).toBe(true)
    expect(reloaded.getRejectedProgress()).toBeNull()
  })
})
