import { useEffect } from 'react'
import { toggleDraw } from './lottery-controller'

// 键盘快捷键：空格 = 开始/停止抽奖（适配翻页笔），F = 切换全屏

export type ShortcutAction = 'toggle-draw' | 'fullscreen' | null

interface KeyInfo {
  key: string
  target: EventTarget | null
}

// 纯判定逻辑：根据按键与上下文决定动作（便于测试）
export function getShortcutAction(e: KeyInfo, blocked: boolean): ShortcutAction {
  if (blocked) {
    return null
  }
  const target = e.target as HTMLElement | null
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
    return null
  }
  // 空格 + 翻页笔常见键：「下一页」多为 PageDown 或 B（黑屏键），「上一页」为 PageUp，
  // 部分型号确认键发 Enter，都映射到开始/停止抽奖
  if (e.key === ' ' || e.key === 'PageDown' || e.key === 'PageUp' || e.key === 'Enter' || e.key === 'b' || e.key === 'B') {
    return 'toggle-draw'
  }
  if (e.key === 'f' || e.key === 'F') {
    return 'fullscreen'
  }
  return null
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
}

export function useLotteryShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 配置面板/确认框/中奖名单打开时不响应，避免误触发
      const blocked = !!document.querySelector('.lottery-config-panel, .confirm-mask, .show-all-win-user')
      const action = getShortcutAction(e, blocked)
      if (action === 'toggle-draw') {
        e.preventDefault() // 防止空格滚动页面/触发聚焦按钮
        toggleDraw()
      } else if (action === 'fullscreen') {
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
