import { describe, it, expect, beforeEach } from 'vitest'
import { THEMES, loadTheme, applyTheme, initTheme } from './lottery-theme'

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('lottery-theme', () => {
  it('内置至少 3 套主题，默认赛博青', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3)
    expect(loadTheme()).toBe('cyan')
  })

  it('applyTheme 设置 data-theme 并持久化', () => {
    applyTheme('festive')
    expect(document.documentElement.dataset.theme).toBe('festive')
    expect(loadTheme()).toBe('festive')
  })

  it('存储里是非法值时回退默认主题', () => {
    localStorage.setItem('___lottery_theme___', '不存在的主题')
    expect(loadTheme()).toBe('cyan')
  })

  it('initTheme 启动时应用持久化的主题', () => {
    applyTheme('violet')
    delete document.documentElement.dataset.theme
    initTheme()
    expect(document.documentElement.dataset.theme).toBe('violet')
  })
})
