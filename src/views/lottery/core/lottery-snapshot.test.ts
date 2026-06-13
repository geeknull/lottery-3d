import { describe, it, expect } from 'vitest'
import { buildSnapshot } from './lottery-snapshot'
import type { SnapshotSource } from './lottery-snapshot'
import type { Prize, DrawLogEntry } from './lottery-types'

function prize(over: Partial<Prize>): Prize {
  return {
    id: 'p', name: '奖', count: 5, countRemain: 5, everyTimeGet: 1,
    detail: '', img: '', round: 0, cardListWin: [], ...over,
  }
}

function draw(over: Partial<DrawLogEntry>): DrawLogEntry {
  return { type: 'draw', at: 0, prizeId: 'p', prizeName: '奖', winnerNames: [], winnerIds: [], ...over }
}

function source(over: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    headerTitle: '幸运大抽奖',
    prizeList: [prize({ id: '特等奖', name: '特等奖', count: 5, countRemain: 3, round: 2 })],
    currentPrize: '特等奖',
    drawLog: [],
    ...over,
  }
}

describe('buildSnapshot', () => {
  it('映射标题、当前奖项、spinning', () => {
    const s = buildSnapshot(source(), true)
    expect(s.headerTitle).toBe('幸运大抽奖')
    expect(s.currentPrizeId).toBe('特等奖')
    expect(s.spinning).toBe(true)
  })

  it('prizes 只含 id/name/count/countRemain/round', () => {
    const s = buildSnapshot(source(), false)
    expect(s.prizes).toEqual([{ id: '特等奖', name: '特等奖', count: 5, countRemain: 3, round: 2 }])
  })

  it('无抽奖记录时 lastReveal 为 null', () => {
    expect(buildSnapshot(source(), false).lastReveal).toBeNull()
  })

  it('lastReveal 取最近一条未撤销的抽奖', () => {
    const s = buildSnapshot(source({
      drawLog: [
        draw({ prizeName: '三等奖', winnerNames: ['张三'] }),
        draw({ prizeName: '一等奖', winnerNames: ['李四', '王五'] }),
      ],
    }), false)
    expect(s.lastReveal).toEqual({ prizeName: '一等奖', winnerNames: ['李四', '王五'] })
  })

  it('跳过已撤销的抽奖与非 draw 条目', () => {
    const s = buildSnapshot(source({
      drawLog: [
        draw({ prizeName: '一等奖', winnerNames: ['张三'] }),
        draw({ prizeName: '二等奖', winnerNames: ['李四'], undone: true }),
        { type: 'undo', at: 0, prizeId: 'p', prizeName: '二等奖', winnerNames: ['李四'], winnerIds: ['李四'] },
      ],
    }), false)
    expect(s.lastReveal).toEqual({ prizeName: '一等奖', winnerNames: ['张三'] })
  })

  it('currentPrize 为 null 时 currentPrizeId 为 null', () => {
    expect(buildSnapshot(source({ currentPrize: null }), false).currentPrizeId).toBeNull()
  })
})
