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

  it('翻页笔常见键（PageDown/PageUp/B/Enter）也切换抽奖', () => {
    // 翻页笔「下一页」通常发 PageDown 或 B（黑屏键），「上一页」发 PageUp
    expect(getShortcutAction(keyEvent('PageDown'), false)).toBe('toggle-draw')
    expect(getShortcutAction(keyEvent('PageUp'), false)).toBe('toggle-draw')
    expect(getShortcutAction(keyEvent('b'), false)).toBe('toggle-draw')
    expect(getShortcutAction(keyEvent('B'), false)).toBe('toggle-draw')
    expect(getShortcutAction(keyEvent('Enter'), false)).toBe('toggle-draw')
  })

  it('F 键切换全屏（大小写均可）', () => {
    expect(getShortcutAction(keyEvent('f'), false)).toBe('fullscreen')
    expect(getShortcutAction(keyEvent('F'), false)).toBe('fullscreen')
  })

  it('R 键复位视角（大小写均可）', () => {
    expect(getShortcutAction(keyEvent('r'), false)).toBe('reset-view')
    expect(getShortcutAction(keyEvent('R'), false)).toBe('reset-view')
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'repeat', 'isComposing', 'defaultPrevented'])(
    '%s 时不触发全局快捷键',
    (flag) => {
      for (const key of ['r', 'R', ' ', 'Enter', 'f']) {
        expect(getShortcutAction({ ...keyEvent(key), [flag]: true }, false)).toBeNull()
      }
    },
  )

  it('其他按键不触发动作', () => {
    expect(getShortcutAction(keyEvent('a'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('Escape'), false)).toBeNull()
  })

  it('焦点在输入框/文本域时不触发', () => {
    expect(getShortcutAction(keyEvent(' ', 'INPUT'), false)).toBeNull()
    expect(getShortcutAction(keyEvent(' ', 'TEXTAREA'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('f', 'INPUT'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('r', 'INPUT'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('R', 'TEXTAREA'), false)).toBeNull()
    expect(getShortcutAction(keyEvent('r', 'SELECT'), false)).toBeNull()
  })

  it('可编辑区域及其子元素不触发快捷键', () => {
    const editor = document.createElement('div')
    editor.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editor.append(child)

    expect(getShortcutAction({ key: 'r', target: editor }, false)).toBeNull()
    expect(getShortcutAction({ key: 'R', target: child }, false)).toBeNull()
    expect(getShortcutAction({ key: ' ', target: child }, false)).toBeNull()
  })

  it.each(['BUTTON', 'A', 'SUMMARY'])('焦点在 %s 内时保留 Enter / Space 的原生行为', (tag) => {
    const control = document.createElement(tag)
    if (tag === 'A') control.setAttribute('href', '#')
    const child = document.createElement('span')
    control.append(child)

    for (const key of ['Enter', ' ']) {
      expect(getShortcutAction({ key, target: control }, false)).toBeNull()
      expect(getShortcutAction({ key, target: child }, false)).toBeNull()
    }
    expect(getShortcutAction({ key: 'r', target: control }, false)).toBe('reset-view')
  })

  it('无元素目标的键盘事件仍可复位', () => {
    expect(getShortcutAction({ key: 'r', target: null }, false)).toBe('reset-view')
    expect(getShortcutAction({ key: 'r', target: window }, false)).toBe('reset-view')
  })

  it('有面板/对话框挡着时不触发', () => {
    expect(getShortcutAction(keyEvent(' '), true)).toBeNull()
    expect(getShortcutAction(keyEvent('f'), true)).toBeNull()
    expect(getShortcutAction(keyEvent('r'), true)).toBeNull()
    expect(getShortcutAction(keyEvent('R'), true)).toBeNull()
  })
})
