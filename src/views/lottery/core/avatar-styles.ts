// 头像风格注册表：把"生成款头像"抽象成可选风格，供配置面板选择、buildCards 生成。
import { createAvatar } from '@dicebear/core'
import { funEmoji, bottts } from '@dicebear/collection'
import { generateAvatar as letterAvatar, hashCode } from './avatar'

export interface AvatarStyle {
  id: string
  label: string
  heavy: boolean               // 是否重（触发大名单提示/降级）
  generate: (name: string) => string  // → data URI
}

export const DEFAULT_AVATAR_STYLE = 'fun-emoji'
export const LIGHT_FALLBACK_STYLE = 'letter-rich'
export const AVATAR_HEAVY_WARN = 500

// 零依赖「渐变首字」：按名字 seed 出渐变底 + 几何点缀 + 首字
function richAvatar(name: string): string {
  const h = hashCode(name)
  const h1 = h % 360
  const h2 = (h1 + 40 + ((h >>> 3) % 80)) % 360
  const s = 55 + ((h >>> 5) % 20)
  const l1 = 32 + ((h >>> 7) % 10)
  const l2 = 20 + ((h >>> 9) % 10)
  const ang = (h >>> 11) % 360
  const dot = (h >>> 13) % 3
  const ch = name.trim().charAt(0) || '?'
  const id = 'g' + h.toString(36)
  const accent = dot === 0 ? ''
    : dot === 1 ? `<circle cx="82" cy="20" r="26" fill="rgba(255,255,255,.10)"/>`
    : `<path d="M0 78 L46 100 L0 100 Z" fill="rgba(255,255,255,.10)"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<defs><linearGradient id="${id}" gradientTransform="rotate(${ang} .5 .5)">` +
    `<stop offset="0" stop-color="hsl(${h1} ${s}% ${l1}%)"/>` +
    `<stop offset="1" stop-color="hsl(${h2} ${s}% ${l2}%)"/></linearGradient></defs>` +
    `<rect width="100" height="100" fill="url(#${id})"/>${accent}` +
    `<text x="50" y="55" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="48" font-weight="600" ` +
    `fill="rgba(255,255,255,0.95)">${ch}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export const AVATAR_STYLES: AvatarStyle[] = [
  { id: 'fun-emoji', label: '表情', heavy: false, generate: n => createAvatar(funEmoji, { seed: n, size: 96 }).toDataUri() },
  { id: 'letter-rich', label: '渐变首字', heavy: false, generate: richAvatar },
  { id: 'letter', label: '纯色首字', heavy: false, generate: letterAvatar },
  { id: 'bottts', label: '机器人', heavy: true, generate: n => createAvatar(bottts, { seed: n, size: 96 }).toDataUri() },
]

const byId = new Map(AVATAR_STYLES.map(s => [s.id, s]))
function styleOf(id: string): AvatarStyle {
  return byId.get(id) ?? byId.get(DEFAULT_AVATAR_STYLE)!
}

// 生成头像；任何风格生成出错都兜底回纯色首字，永不抛。
export function generateAvatarFor(name: string, styleId: string = DEFAULT_AVATAR_STYLE): string {
  try {
    return styleOf(styleId).generate(name)
  } catch {
    return letterAvatar(name)
  }
}

// 生效风格：开了自动降级 + 重风格 + 名单超阈值 → 降级为轻量；否则原样。非法 id → 默认。
export function resolveStyle(styleId: string, rosterSize: number, autoDowngrade: boolean): string {
  const s = styleOf(styleId)
  if (autoDowngrade && s.heavy && rosterSize > AVATAR_HEAVY_WARN) return LIGHT_FALLBACK_STYLE
  return s.id
}
