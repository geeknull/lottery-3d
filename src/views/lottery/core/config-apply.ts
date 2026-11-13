import lotteryConfig from './lottery-config'
import { configHash, isPrizePresentation, normalizeRoster, parseRosterEntries, saveUserConfig } from './config-store'
import type { PrizeConfig, RosterEntry, UserLotteryConfig } from './config-store'
import { persistConfigImages } from './config-images'
import { gcImages, isImageRef } from './image-store'
import { isRehearsal } from './rehearsal'

interface ConfigDraft {
  title: string
  prizes: PrizeConfig[]
  rosterText: string
  avatarStyle: string
  avatarAutoDowngrade: boolean
}

export type DraftResult = { config: UserLotteryConfig; error?: never } | { config?: never; error: string }

export function prepareConfig(draft: ConfigDraft): DraftResult {
  const { title, prizes, rosterText, avatarStyle, avatarAutoDowngrade } = draft
  if (!title.trim()) return { error: '请填写活动标题' }
  if (!prizes.length) return { error: '至少需要一个奖项' }
  for (const prize of prizes) {
    if (!prize.name.trim()) return { error: '奖项名称不能为空' }
    // Existing imported configurations can contain fractional counts. Preserve
    // their values so saving does not change the established draw/verification stream.
    if (!Number.isFinite(prize.count) || !Number.isFinite(prize.everyTimeGet) || prize.count < 1 || prize.everyTimeGet < 1) {
      return { error: '奖项总数和每轮抽取数至少为 1，且必须为有效数字' }
    }
    if (prize.presentation !== undefined && !isPrizePresentation(prize.presentation)) {
      return { error: '揭晓节奏请选择简洁或隆重' }
    }
  }
  const roster = parseRosterEntries(rosterText)
  if (!roster.length) return { error: '抽奖名单不能为空' }
  const total = prizes.reduce((sum, prize) => sum + prize.count, 0)
  if (total > roster.length) return { error: `奖品总数（${total}）超过了名单人数（${roster.length}），请调整奖项数量或补充名单` }
  return { config: {
    version: 1,
    headerTitle: title.trim(),
    prizes: prizes.map(prize => ({ ...prize, name: prize.name.trim() })),
    // 有头像、工号或部门任一项就保留对象，否则只存名字（纯名字名单的配置文件与以前相同）
    roster: roster.map(entry => entry.avatar || entry.employeeId || entry.department ? entry : entry.name),
    avatarStyle,
    ...(avatarAutoDowngrade ? { avatarAutoDowngrade: true } : {}),
  } }
}

interface ApplicationDependencies {
  activeHash(): string
  confirmReset(config: UserLotteryConfig): Promise<boolean>
  persistImages(config: UserLotteryConfig): Promise<UserLotteryConfig>
  save(config: UserLotteryConfig): boolean
  clearProgress(): void
  collectImages(refs: string[]): Promise<void>
  reload(): void
  readOnly(): boolean
}

export type ApplyResult = 'applied' | 'cancelled' | 'busy'

// Centralizes the ordering: no progress is cleared until configuration + images are saved.
// The in-flight guard also covers repeated clicks while the confirmation is open.
export function createConfigApplication(dependencies: ApplicationDependencies) {
  let busy = false
  return async (config: UserLotteryConfig): Promise<ApplyResult> => {
    if (busy) return 'busy'
    if (dependencies.readOnly()) throw new Error('配置保存失败：彩排使用正式配置的只读副本，请回到正式舞台修改配置')
    busy = true
    try {
      const reset = configHash(config.headerTitle, config.prizes, config.roster) !== dependencies.activeHash()
      if (reset && !(await dependencies.confirmReset(config))) return 'cancelled'
      let persisted: UserLotteryConfig
      try {
        persisted = await dependencies.persistImages(config)
      } catch (cause) {
        throw new Error('配置保存失败：图片写入失败，请检查浏览器存储空间后重试', { cause })
      }
      if (!dependencies.save(persisted)) throw new Error('配置保存失败：本地存储空间可能已满，请精简后重试')
      if (reset) dependencies.clearProgress()
      await dependencies.collectImages(persisted.prizes.map(prize => prize.img).filter(isImageRef)).catch(() => {})
      dependencies.reload()
      return 'applied'
    } finally {
      busy = false
    }
  }
}

export function configChangesProgress(config: UserLotteryConfig): boolean {
  return configHash(config.headerTitle, config.prizes, config.roster) !== activeConfigHash()
}

function activeConfigHash(): string {
  return configHash(lotteryConfig.headerTitle, lotteryConfig.prizeList, lotteryConfig.cardList)
}

// 会让进度失效的改动，与配置指纹的组成一一对应
export type ProgressResetReason = 'title' | 'prizes' | 'names' | 'employeeIds'

interface FingerprintParts { headerTitle: string; prizes: Pick<PrizeConfig, 'name' | 'count' | 'everyTimeGet'>[]; roster: (string | RosterEntry)[] }

// 逐项比较指纹的组成，找出是哪些改动导致进度要清空。名单姓名或顺序变了时，工号的逐行比较没有意义，不再单列。
export function progressResetReasons(next: FingerprintParts, active: FingerprintParts): ProgressResetReason[] {
  const prizeKeys = (prizes: FingerprintParts['prizes']) => JSON.stringify(prizes.map(({ name, count, everyTimeGet }) => [name, count, everyTimeGet]))
  const names = (roster: FingerprintParts['roster']) => JSON.stringify(normalizeRoster(roster).map(entry => entry.name))
  const employeeIds = (roster: FingerprintParts['roster']) => JSON.stringify(normalizeRoster(roster).map(entry => entry.employeeId ?? ''))
  const reasons: ProgressResetReason[] = []
  if (next.headerTitle !== active.headerTitle) reasons.push('title')
  if (prizeKeys(next.prizes) !== prizeKeys(active.prizes)) reasons.push('prizes')
  if (names(next.roster) !== names(active.roster)) reasons.push('names')
  else if (employeeIds(next.roster) !== employeeIds(active.roster)) reasons.push('employeeIds')
  return reasons
}

const REASON_SHORT: Record<ProgressResetReason, string> = {
  title: '活动标题', prizes: '奖项规则', names: '名单姓名或顺序', employeeIds: '工号',
}
const REASON_DETAIL: Record<ProgressResetReason, string> = {
  title: '活动标题有改动',
  prizes: '奖项名称、总数或每轮人数有改动',
  names: '名单的姓名或顺序有改动',
  employeeIds: '工号有改动。工号参与配置指纹，用来区分同名的人；工号变了，已保存的中奖记录无法确认对应的是谁',
}

export function shortResetReasons(reasons: ProgressResetReason[]): string {
  return reasons.map(reason => REASON_SHORT[reason]).join('、')
}

// 清空进度确认框的文案：写清会清空什么、为什么要清空。
export function resetConfirmMessage(reasons: ProgressResetReason[], progress: { winners: number; draws: number }): string {
  const cleared = progress.draws > 0
    ? `会清空：已抽出的 ${progress.winners} 位中奖者和 ${progress.draws} 条抽奖流水（含撤销、作废记录）；随机种子重新生成，已公布的开抽前指纹和公证卡作废。`
    : '当前还没有抽奖记录；随机种子会重新生成，已公布的开抽前指纹和公证卡作废。'
  const why = reasons.length ? reasons.map(reason => REASON_DETAIL[reason]).join('；') : '配置指纹有变化'
  return `保存新配置会清空当前抽奖进度并刷新页面。\n${cleared}\n原因：${why}。\n确定吗？`
}

function activeFingerprintParts(): FingerprintParts {
  return { headerTitle: lotteryConfig.headerTitle, prizes: lotteryConfig.prizeList, roster: lotteryConfig.cardList }
}

// 当前配置与正在进行的场次相比，会导致清空进度的改动
export function describeProgressReset(config: UserLotteryConfig): ProgressResetReason[] {
  return progressResetReasons({ headerTitle: config.headerTitle, prizes: config.prizes, roster: config.roster }, activeFingerprintParts())
}

export function currentResetConfirmMessage(config: UserLotteryConfig): string {
  return resetConfirmMessage(describeProgressReset(config), {
    winners: lotteryConfig.cardListWinAll.length,
    draws: lotteryConfig.drawLog.length,
  })
}

export function makeConfigApplication(confirmReset: (config: UserLotteryConfig) => Promise<boolean>) {
  return createConfigApplication({
    activeHash: activeConfigHash,
    confirmReset,
    persistImages: persistConfigImages,
    save: saveUserConfig,
    clearProgress: () => lotteryConfig.clearLocalStorage(),
    collectImages: gcImages,
    reload: () => location.reload(),
    readOnly: isRehearsal,
  })
}
