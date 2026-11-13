import type { LotteryConfig } from './lottery-config'
import type { LotteryPhase } from './lottery-status'
import { createWinnerLabeler } from './participant-identity'

// 展示窗广播给控制窗的只读状态投影。控制窗据此渲染镜像 UI，不持有任何权威数据。
export interface PrizeSnapshot {
  id: string
  name: string
  count: number
  countRemain: number
  round: number
}

export interface StateSnapshot {
  headerTitle: string
  prizes: PrizeSnapshot[]
  currentPrizeId: string | null
  spinning: boolean
  // winnerLabels：重名者带工号或部门后缀的显示名（与 winnerNames 同序）；快照源不带名单时缺省
  lastReveal: { prizeName: string; winnerNames: string[]; winnerLabels?: string[] } | null
  phase?: LotteryPhase
  winnerGroupIndex?: number | null
  groupCount?: number
  replayAvailable?: boolean
}

// 构建快照只需要 config 的这几个字段（不依赖方法，便于测试）；带上名单时生成重名后缀
export type SnapshotSource = Pick<LotteryConfig, 'headerTitle' | 'prizeList' | 'currentPrize' | 'drawLog'> & Partial<Pick<LotteryConfig, 'cardList'>>

// 纯函数：从 lotteryConfig（执行端权威状态）+ spinning 构建只读快照。
// lastReveal 取 drawLog 里最近一条未撤销的抽奖，控制窗用来显示"最近中奖"。
export function buildSnapshot(src: SnapshotSource, spinning: boolean, presentation: Pick<StateSnapshot, 'phase' | 'winnerGroupIndex' | 'groupCount' | 'replayAvailable'> = {}): StateSnapshot {
  let lastReveal: StateSnapshot['lastReveal'] = null
  for (let i = src.drawLog.length - 1; i >= 0; i--) {
    const e = src.drawLog[i]
    if (e.type === 'draw' && !e.undone) {
      lastReveal = { prizeName: e.prizeName, winnerNames: e.winnerNames }
      if (src.cardList) {
        const labelOf = createWinnerLabeler(src.cardList)
        const byId = new Map(src.cardList.map(card => [card.id, card]))
        lastReveal.winnerLabels = e.winnerIds.map((id, k) => {
          const card = byId.get(id)
          return card ? labelOf(card) : e.winnerNames[k]
        })
      }
      break
    }
  }
  return {
    headerTitle: src.headerTitle,
    prizes: src.prizeList.map(p => ({
      id: p.id,
      name: p.name,
      count: p.count,
      countRemain: p.countRemain,
      round: p.round,
    })),
    currentPrizeId: src.currentPrize,
    spinning,
    lastReveal,
    ...presentation,
  }
}
