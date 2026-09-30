import { useEffect } from 'react'
import { resetView, toggleDraw } from './lottery-controller'

// 键盘快捷键：空格 = 开始/停止抽奖（适配翻页笔），F = 切换全屏，R = 视角复位

export type ShortcutAction = 'toggle-draw' | 'fullscreen' | 'reset-view' | null

interface KeyInfo {
  key: string
  target: EventTarget | null
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  repeat?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
}

// 纯判定逻辑：根据按键与上下文决定动作（便于测试）
export function getShortcutAction(e: KeyInfo, blocked: boolean): ShortcutAction {
  if (blocked || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat || e.isComposing || e.defaultPrevented) {
    return null
  }
  const target = e.target instanceof Element ? e.target : null
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) {
    return null
  }
  // 聚焦按钮或链接时，保留 Enter / Space 的原生激活行为，不额外触发抽奖。
  if ((e.key === ' ' || e.key === 'Enter') && target?.closest('button, a[href], summary, [role="button"]')) {
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
  if (e.key === 'r' || e.key === 'R') {
    return 'reset-view'
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
      // 面板或对话框打开时不响应，避免在遮罩下操作抽奖和视角。
      const blocked = !!document.querySelector('.lottery-config-panel, .confirm-mask, .show-all-win-user, .lottery-fairness, .lottery-history, .lottery-compat-notice, [role="dialog"], [aria-modal="true"], dialog[open]')
      const action = getShortcutAction(e, blocked)
      if (action === 'toggle-draw') {
        e.preventDefault() // 防止空格滚动页面/触发聚焦按钮
        toggleDraw()
      } else if (action === 'fullscreen') {
        toggleFullscreen()
      } else if (action === 'reset-view') {
        e.preventDefault()
        void resetView()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
