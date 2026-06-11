// 主题配色：颜色都收敛到 lottery-theme.scss 的 CSS 变量，
// 这里负责主题清单、持久化与切换。

export const THEMES = [
  { id: 'cyan', name: '赛博青' },
  { id: 'festive', name: '春节红金' },
  { id: 'violet', name: '极客紫' },
] as const

export type ThemeId = typeof THEMES[number]['id']

const THEME_KEY = '___lottery_theme___'
const DEFAULT_THEME: ThemeId = 'cyan'

function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some(t => t.id === value)
}

export function loadTheme(): ThemeId {
  const saved = localStorage.getItem(THEME_KEY)
  return isThemeId(saved) ? saved : DEFAULT_THEME
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  localStorage.setItem(THEME_KEY, id)
}

// 应用启动时恢复持久化的主题
export function initTheme(): void {
  document.documentElement.dataset.theme = loadTheme()
}
