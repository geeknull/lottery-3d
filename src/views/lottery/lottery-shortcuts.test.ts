import { describe, it, expect } from 'vitest'
import { getShortcutAction } from './lottery-shortcuts'

function keyEvent(key: string, targetTag = 'BODY') {
  const target = document.createElement(targetTag === 'BODY' ? 'div' : targetTag)
  return { key, target: targetTag === 'BODY' ? document.body : target }
}

describe('getShortcutAction', () => {
  it('空格切换抽奖开始/停止', () => {
    expect(getShortcutAction(keyEvent(' '), false)).toBe('toggle-draw')
  })

  it('F 键切换全屏（大小写均可）', () => {
    expect(getShortcutAction(keyEvent('f'), false)).toBe('fullscreen')
    expect(getShortcutAction(keyEvent('F'), false)).toBe('fullscreen')
  })

  it('其他按键不触发动作', () => {
    expect(getShortcutAction(keyEvent('a'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('Enter'), false)).toBeNull()
  })

  it('焦点在输入框/文本域时不触发', () => {
    expect(getShortcutAction(keyEvent(' ', 'INPUT'), false)).toBeNull()
    expect(getShortcutAction(keyEvent(' ', 'TEXTAREA'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('f', 'INPUT'), false)).toBeNull()
  })

  it('有面板/对话框挡着时不触发', () => {
    expect(getShortcutAction(keyEvent(' '), true)).toBeNull()
    expect(getShortcutAction(keyEvent('f'), true)).toBeNull()
  })
})
