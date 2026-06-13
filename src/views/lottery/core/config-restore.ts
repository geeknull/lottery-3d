import type { Card } from './lottery-types'

// 恢复存档前的完整性校验：进度数组字段必须是数组，且中奖/排除名单里的 id
// 必须都属于当前名单。任一不满足就当新局，挡住三类问题：
// 1) 被篡改的非数组字段 → 否则模块顶层 import 期 .map/.some 抛错导致全屏白屏
// 2) 32 位 djb2 指纹的偶然碰撞 → 名单对不上的旧存档被照单全收
// 3) 手改 localStorage / 未来改 id 生成规则带来的 id 错配
export function isSavedRestorable(saved: unknown, cardList: Card[]): boolean {
  if (!saved || typeof saved !== 'object') {
    return false
  }
  const s = saved as Record<string, unknown>

  // 进度数组字段类型校验（可选字段缺省允许，存在则必须是数组）
  if (!Array.isArray(s.cardListWinAll) || !Array.isArray(s.cardListRemainAll)) {
    return false
  }
  if (s.prizeList != null && !Array.isArray(s.prizeList)) {
    return false
  }
  if (s.cardListExcluded != null && !Array.isArray(s.cardListExcluded)) {
    return false
  }
  if (s.drawLog != null && !Array.isArray(s.drawLog)) {
    return false
  }

  // 中奖/排除名单里的每个条目都必须是合法卡片且 id 属于当前名单
  const validIds = new Set(cardList.map(c => c.id))
  const referenced = [
    ...(s.cardListWinAll as unknown[]),
    ...((s.cardListExcluded as unknown[]) ?? []),
  ]
  for (const c of referenced) {
    if (!c || typeof c !== 'object') {
      return false
    }
    const id = (c as Record<string, unknown>).id
    if (typeof id !== 'string' || !validIds.has(id)) {
      return false
    }
  }
  return true
}
