// 配置与图片仓的桥接：保存时把奖品图的 dataURL 移进 IndexedDB（配置只留 idb: 引用），
// 导出自包含时再还原成 dataURL，启动后把运行时的引用 hydrate 成可显示的图片。
import lotteryConfig from './lottery-config'
import { notifyLotteryChange } from './lottery-store'
import { putImage, getManyImages, isImageRef } from './image-store'
import type { UserLotteryConfig, PrizeConfig } from './config-store'

function isDataUrl(s: string | undefined): s is string {
  return typeof s === 'string' && s.startsWith('data:')
}

// 保存/导入前：奖品图的 dataURL 存入 idb，img 换成 idb: 引用（http URL / 已是引用 / 空 不动）
export async function persistConfigImages(cfg: UserLotteryConfig): Promise<UserLotteryConfig> {
  const prizes: PrizeConfig[] = await Promise.all(cfg.prizes.map(async p => {
    if (isDataUrl(p.img)) {
      return { ...p, img: await putImage(p.img) }
    }
    return p
  }))
  return { ...cfg, prizes }
}

// 导出自包含：把 idb: 引用还原成 dataURL inline 进配置（可移植，能发给他人）
export async function inlineConfigImages(cfg: UserLotteryConfig): Promise<UserLotteryConfig> {
  const refs = cfg.prizes.map(p => p.img).filter(isImageRef)
  if (refs.length === 0) {
    return cfg
  }
  const map = await getManyImages(refs)
  const prizes = cfg.prizes.map(p =>
    isImageRef(p.img) ? { ...p, img: map.get(p.img as string) } : p
  )
  return { ...cfg, prizes }
}

// 运行时 hydrate：把 prizeList[].img 的 idb 引用补成 dataURL 并通知重渲染
export async function hydrateLotteryImages(): Promise<void> {
  const refs = lotteryConfig.prizeList.map(p => p.img).filter(isImageRef)
  if (refs.length === 0) {
    return void 0
  }
  let map: Map<string, string>
  try {
    map = await getManyImages(refs)
  } catch {
    map = new Map() // IndexedDB 不可用：降级为无图，不让组件渲染到无效的 idb: src
  }
  let changed = false
  lotteryConfig.prizeList.forEach(p => {
    if (isImageRef(p.img)) {
      p.img = map.get(p.img) ?? ''
      changed = true
    }
  })
  if (changed) {
    notifyLotteryChange()
  }
}
