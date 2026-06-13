import type { LotteryConfig } from './lottery-config'

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
  lastReveal: { prizeName: string; winnerNames: string[] } | null
}

// 构建快照只需要 config 的这几个字段（不依赖方法，便于测试）
export type SnapshotSource = Pick<LotteryConfig, 'headerTitle' | 'prizeList' | 'currentPrize' | 'drawLog'>

// 纯函数：从 lotteryConfig（执行端权威状态）+ spinning 构建只读快照。
// lastReveal 取 drawLog 里最近一条未撤销的抽奖，控制窗用来显示"最近中奖"。
export function buildSnapshot(src: SnapshotSource, spinning: boolean): StateSnapshot {
  let lastReveal: StateSnapshot['lastReveal'] = null
  for (let i = src.drawLog.length - 1; i >= 0; i--) {
    const e = src.drawLog[i]
    if (e.type === 'draw' && !e.undone) {
      lastReveal = { prizeName: e.prizeName, winnerNames: e.winnerNames }
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
  }
}
