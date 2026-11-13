// 从验证文件恢复进度的“检查 + 重建”部分，不写任何存储（写入在 lottery-config 的 replaceProgress）。
// 顺序固定：先独立复算整份文件，再和当前配置逐项比对，最后重建存档并做结构校验。任何一步不过就停。
// 不 import lottery-config：当前名单和奖项由调用方传入，便于单测。
import { verifyVerificationPackage } from './fairness-package'
import type { VerificationPackage } from './fairness-package'
import { isSavedRestorable } from './config-restore'
import type { SavedProgress } from './config-restore'
import type { Card, Prize } from './lottery-types'

type RosterPerson = Pick<Card, 'id' | 'name' | 'employeeId'>
type PrizeRule = Pick<Prize, 'id' | 'name' | 'count' | 'everyTimeGet'>

export interface RestoreSummary {
  rounds: number // 有效轮数（不含被撤销的轮次）
  winners: number // 当前仍有效的中奖人数
  entries: number // 流水条数（抽奖、作废、撤销）
}

export type RestorePlan =
  | { ok: true; saved: SavedProgress; summary: RestoreSummary }
  | { ok: false; reason: string }

const CONFIG_HINT = '请先导入这份备份对应的配置'

// 验证文件里缺省 employeeId 表示没有工号；卡片上空串也当作没有。
const employeeIdOf = (person: RosterPerson): string => person.employeeId || ''

// 工号不同时，没有工号的一方写“无工号”；只有 ID 不同时附上 ID，否则两边看起来一模一样。
function describePerson(person: RosterPerson, options: { employee: boolean; id: boolean }): string {
  const employeeId = employeeIdOf(person)
  return person.name
    + (employeeId ? `（工号 ${employeeId}）` : options.employee ? '（无工号）' : '')
    + (options.id ? `［ID ${person.id}］` : '')
}

// 名单顺序是算法输入：逐位比较 ID、姓名、工号，不排序。返回第一处差异的说明，一致时返回 null。
export function compareRoster(backup: RosterPerson[], current: RosterPerson[]): string | null {
  const length = Math.min(backup.length, current.length)
  for (let i = 0; i < length; i++) {
    const a = backup[i]
    const b = current[i]
    if (a.id === b.id && a.name === b.name && employeeIdOf(a) === employeeIdOf(b)) continue
    const employeeDiffers = employeeIdOf(a) !== employeeIdOf(b)
    const options = { employee: employeeDiffers, id: a.name === b.name && !employeeDiffers }
    const what = a.name === b.name && employeeDiffers ? '工号不同，' : ''
    return `备份里的名单和当前名单不一致（第 ${i + 1} 位：${what}备份是 ${describePerson(a, options)}，当前是 ${describePerson(b, options)}）。${CONFIG_HINT}`
  }
  if (backup.length !== current.length) {
    return `备份里的名单和当前名单不一致（人数不同：备份 ${backup.length} 人，当前 ${current.length} 人）。${CONFIG_HINT}`
  }
  return null
}

function describeRule(prize: PrizeRule): string {
  return `${prize.name}：共 ${prize.count} 个，每轮 ${prize.everyTimeGet} 个`
}

// 奖项规则同样按顺序逐项比较 ID、名称、总数、每轮人数。
export function comparePrizes(backup: PrizeRule[], current: PrizeRule[]): string | null {
  const length = Math.min(backup.length, current.length)
  for (let i = 0; i < length; i++) {
    const a = backup[i]
    const b = current[i]
    if (a.id === b.id && a.name === b.name && a.count === b.count && a.everyTimeGet === b.everyTimeGet) continue
    return `备份里的奖项规则和当前不一致（第 ${i + 1} 个奖项：备份是「${describeRule(a)}」，当前是「${describeRule(b)}」）。${CONFIG_HINT}`
  }
  if (backup.length !== current.length) {
    return `备份里的奖项规则和当前不一致（奖项个数不同：备份 ${backup.length} 个，当前 ${current.length} 个）。${CONFIG_HINT}`
  }
  return null
}

// 只用验证文件和当前名单重建存档。调用前必须已经通过 verifyVerificationPackage 和上面两项比对。
// cardListWinAll 是跨奖项的中奖先后顺序，验证文件里没有现成字段，要按流水重放：
// 抽奖追加、作废删一人、撤销删掉最近一轮有效抽奖仍在的中奖人（与 lottery-algorithm 相同）。
export function rebuildSavedProgress(pkg: VerificationPackage, cardList: Pick<Card, 'id'>[]): SavedProgress {
  let winAll: string[] = []
  const activeDraws: string[][] = []
  for (const entry of pkg.drawLog) {
    if (entry.type === 'draw') {
      winAll = [...winAll, ...entry.winnerIds]
      activeDraws.push(entry.winnerIds)
    } else if (entry.type === 'void') {
      winAll = winAll.filter(id => id !== entry.winnerIds[0])
    } else {
      const undone = new Set(activeDraws.pop() ?? [])
      winAll = winAll.filter(id => !undone.has(id))
    }
  }
  const won = new Set(winAll)
  const excluded = new Set(pkg.finalState.excludedIds)
  return {
    version: 2,
    currentPrize: null,
    prizeList: pkg.finalState.prizes.map(prize => ({
      id: prize.id,
      countRemain: prize.countRemain,
      round: prize.round,
      cardListWin: [...prize.winnerIds],
    })),
    cardListWinAll: winAll,
    // 剩余奖池按当前名单顺序过滤，与 recomputeRemain 同规则。
    cardListRemainAll: cardList.map(card => card.id).filter(id => !won.has(id) && !excluded.has(id)),
    cardListExcluded: [...pkg.finalState.excludedIds],
    seed: pkg.seed,
    rngState: pkg.finalState.rngState,
    seedCommit: pkg.seedCommit,
    // version 1 没有盐：不写这个键，和当时的旧存档一致。
    ...(pkg.version === 2 ? { seedSalt: pkg.seedSalt } : {}),
    drawLog: pkg.drawLog.map(entry => ({
      ...entry,
      winnerIds: [...entry.winnerIds],
      winnerNames: [...entry.winnerNames],
      ...(entry.poolIds ? { poolIds: [...entry.poolIds] } : {}),
    })),
  }
}

export function summarizeProgress(progress: Pick<SavedProgress, 'drawLog' | 'cardListWinAll'>): RestoreSummary {
  const drawLog = progress.drawLog ?? []
  return {
    rounds: drawLog.filter(entry => entry.type === 'draw' && !entry.undone).length,
    winners: progress.cardListWinAll.length,
    entries: drawLog.length,
  }
}

// 恢复前的全部检查。raw 是 JSON.parse 之后的值；任何一项不过都返回原因，不产生存档。
export async function planProgressRestore(
  raw: unknown,
  current: { cardList: Card[]; prizeList: (PrizeRule & Pick<Prize, 'id'>)[] },
): Promise<RestorePlan> {
  // 非安全上下文没有 crypto.subtle 时，校验器会给出“此环境无法验证”的原因：不能降级为只看结构。
  const verified = await verifyVerificationPackage(raw)
  if (!verified.ok) {
    const at = verified.failedAt === null ? '' : `第 ${verified.failedAt + 1} 条记录：`
    return { ok: false, reason: `验证文件没有通过复算：${at}${verified.reason ?? '未知原因'}` }
  }
  const pkg = raw as VerificationPackage
  const rosterDiff = compareRoster(pkg.roster, current.cardList)
  if (rosterDiff) return { ok: false, reason: rosterDiff }
  const prizeDiff = comparePrizes(pkg.prizes, current.prizeList)
  if (prizeDiff) return { ok: false, reason: prizeDiff }
  const saved = rebuildSavedProgress(pkg, current.cardList)
  // 前面几项通过后理论上不会失败，作为最后一道保险。
  if (!isSavedRestorable(saved, current.cardList, current.prizeList)) {
    return { ok: false, reason: '备份无法转成进度：存档结构校验未通过' }
  }
  return { ok: true, saved, summary: summarizeProgress(saved) }
}
