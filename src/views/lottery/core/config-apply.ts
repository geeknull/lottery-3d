import lotteryConfig from './lottery-config'
import { configHash, isPrizePresentation, parseRosterEntries, saveUserConfig } from './config-store'
import type { PrizeConfig, UserLotteryConfig } from './config-store'
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
    roster: roster.map(entry => entry.avatar ? entry : entry.name),
    avatarStyle,
    ...(avatarAutoDowngrade ? { avatarAutoDowngrade: true } : {}),
  } }
}

interface ApplicationDependencies {
  activeHash(): string
  confirmReset(): Promise<boolean>
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
      if (reset && !(await dependencies.confirmReset())) return 'cancelled'
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
  return configHash(lotteryConfig.headerTitle, lotteryConfig.prizeList, lotteryConfig.cardList.map(card => card.name))
}

export function makeConfigApplication(confirmReset: () => Promise<boolean>) {
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
