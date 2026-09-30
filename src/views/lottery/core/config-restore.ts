import type { Card, DrawLogEntry, Prize } from './lottery-types'

export type SavedCardReference = string | Pick<Card, 'id'>

export interface SavedProgress {
  version?: 2
  currentPrize?: string | null
  prizeList?: {
    id: string
    countRemain: number
    round: number
    cardListWin: SavedCardReference[]
  }[]
  cardListWinAll: SavedCardReference[]
  cardListRemainAll: SavedCardReference[]
  cardListExcluded?: SavedCardReference[]
  seed?: number
  rngState?: number
  seedCommit?: string
  drawLog?: DrawLogEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isSeed(value: unknown): value is number {
  return isCount(value) && value <= 0xffffffff
}

// 同时接受旧完整卡片存档与 v2 ID 存档，但不混用两种表示。
// 校验所有引用（包括剩余池和奖项内部），恢复时才可安全地按 id 取当前卡片。
export function isSavedRestorable(
  saved: unknown,
  cardList: Card[],
  prizeList?: Pick<Prize, 'id'>[],
): saved is SavedProgress {
  if (!isRecord(saved) || (saved.version !== undefined && saved.version !== 2)) return false
  const compact = saved.version === 2
  const validIds = new Set(cardList.map(card => card.id))
  const prizesById = prizeList && new Map(prizeList.map(prize => [prize.id, prize]))

  const isCardList = (value: unknown): value is SavedCardReference[] => Array.isArray(value)
    && value.every(card => compact
      ? typeof card === 'string' && validIds.has(card)
      : isRecord(card) && typeof card.id === 'string' && validIds.has(card.id))
  const isIds = (value: unknown): value is string[] => Array.isArray(value)
    && value.every(id => typeof id === 'string' && validIds.has(id))
  const isPrizeId = (value: unknown): value is string => typeof value === 'string'
    && (!prizesById || prizesById.has(value))

  if (!isCardList(saved.cardListWinAll) || !isCardList(saved.cardListRemainAll)) return false
  if (saved.cardListExcluded !== undefined && !isCardList(saved.cardListExcluded)) return false
  if (saved.currentPrize != null && !isPrizeId(saved.currentPrize)) return false

  if (saved.prizeList !== undefined) {
    if (!Array.isArray(saved.prizeList)) return false
    const seen = new Set<string>()
    for (const prize of saved.prizeList) {
      // 旧配置入口允许小数名额，抽取后余额也可能为负；不能因此丢弃整场历史。
      if (!isRecord(prize) || !isPrizeId(prize.id) || seen.has(prize.id)
        || typeof prize.countRemain !== 'number' || !Number.isFinite(prize.countRemain)
        || !isCount(prize.round)
        || !isCardList(prize.cardListWin)) return false
      seen.add(prize.id)
    }
  }

  if (saved.seed !== undefined && !isSeed(saved.seed)) return false
  if (saved.rngState !== undefined && !isSeed(saved.rngState)) return false
  if (saved.seedCommit !== undefined && typeof saved.seedCommit !== 'string') return false
  if (saved.drawLog !== undefined) {
    if (!Array.isArray(saved.drawLog)) return false
    for (const entry of saved.drawLog) {
      if (!isRecord(entry) || (entry.type !== 'draw' && entry.type !== 'void' && entry.type !== 'undo')
        || !isCount(entry.at) || !isPrizeId(entry.prizeId) || typeof entry.prizeName !== 'string'
        || !isIds(entry.winnerIds) || !Array.isArray(entry.winnerNames)
        || !entry.winnerNames.every(name => typeof name === 'string')
        || entry.winnerNames.length !== entry.winnerIds.length) return false
      if (entry.poolIds !== undefined && !isIds(entry.poolIds)) return false
      if (entry.rngStateBefore !== undefined && !isSeed(entry.rngStateBefore)) return false
      if (entry.note !== undefined && typeof entry.note !== 'string') return false
      if (entry.undone !== undefined && typeof entry.undone !== 'boolean') return false
    }
  }
  return true
}
