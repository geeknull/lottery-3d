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
