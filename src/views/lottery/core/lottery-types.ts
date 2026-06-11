// 抽奖业务的核心数据结构

// 一张抽奖卡片（一个参与抽奖的人）
export interface Card {
  name: string
  id: string
  sex?: string
  avatar: string
  index: number // 在 cardList 中的下标
  row: number // table 模式下的行号（从 1 开始）
  col: number // table 模式下的列号（从 1 开始）
}

// 一个奖项
export interface Prize {
  count: number // 总数量
  countRemain: number // 剩余的数量
  everyTimeGet: number // 每轮抽取数量
  name: string
  detail?: string
  img?: string
  id: string
  round: number // 已抽取轮数
  cardListWin: Card[] // 本奖项的中奖名单
}

// 一次操作的流水记录（抽奖 / 作废 / 撤销），用于历史时间线与可验证复算
export interface DrawLogEntry {
  type: 'draw' | 'void' | 'undo' // 操作类型
  at: number // 时间戳（毫秒）
  prizeId: string
  prizeName: string
  winnerNames: string[] // 涉及的人名（展示用）
  winnerIds: string[]
  note?: string // 备注（如作废是否退回奖池）
  // 仅抽奖（type==='draw'）有以下复算字段：
  rngStateBefore?: number // 本轮抽取前的 rng 状态（首轮 = seed）
  poolIds?: string[] // 抽取前奖池的 id 顺序
  undone?: boolean // 该轮抽奖已被撤销（中奖作废，但仍消耗了随机流，验证时照常复算）
}
