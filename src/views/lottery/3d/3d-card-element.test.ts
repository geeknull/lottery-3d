import { describe, it, expect, vi } from 'vitest'
import { createCardElement } from './3d-card-element'
import type { Card } from '../core/lottery-types'

// 业务模块加载时有调试日志，保持测试输出干净
vi.spyOn(console, 'log').mockImplementation(() => {})

function card(over: Partial<Card>): Card {
  return { name: 'x', id: 'x', avatar: '', index: 0, row: 1, col: 1, ...over }
}

describe('createCardElement XSS 防护', () => {
  it('名字/id 含 HTML 不会被解析成元素（textContent，非 innerHTML）', () => {
    const el = createCardElement(
      card({ name: '<img src=x onerror=alert(1)>', id: '<b>boom</b>' }),
      false,
    )
    // 卡片里只有头像那一个 img；若 payload 被当 HTML 解析会多出 img/标签元素
    expect(el.querySelectorAll('img')).toHaveLength(1)
    expect(el.querySelector('.symbol')?.children).toHaveLength(0)
    expect(el.querySelector('.details')?.children).toHaveLength(0)
    // payload 原样作为纯文本显示
    expect(el.querySelector('.symbol')?.textContent).toBe('<img src=x onerror=alert(1)>')
    expect(el.querySelector('.details')?.textContent).toBe('<b>boom</b>')
  })

  it('正常名字/id 正确渲染，中奖卡片带 prize class 与 data-card-id', () => {
    const el = createCardElement(card({ name: '张三', id: '张三-2' }), true)
    expect(el.querySelector('.symbol')?.textContent).toBe('张三')
    expect(el.querySelector('.details')?.textContent).toBe('张三-2')
    expect(el.classList.contains('prize')).toBe(true)
    expect(el.dataset.cardId).toBe('张三-2')
  })

  it('非中奖卡片无 prize class', () => {
    expect(createCardElement(card({}), false).classList.contains('prize')).toBe(false)
  })
})

describe('卡片身份显示', () => {
  it('有工号时 .details 显示工号，部门在悬停提示里', () => {
    const el = createCardElement(card({ name: '张伟', id: '张伟-2', employeeId: 'A002', department: '市场部' }), false)
    expect(el.querySelector('.details')?.textContent).toBe('A002')
    expect(el.querySelector<HTMLElement>('.details')?.title).toBe('A002 · 市场部')
    expect(el.dataset.cardId).toBe('张伟-2')
  })

  it('只有部门时仍显示 ID', () => {
    const el = createCardElement(card({ name: '张伟', id: '张伟', department: '研发部' }), false)
    expect(el.querySelector('.details')?.textContent).toBe('张伟')
    expect(el.querySelector<HTMLElement>('.details')?.title).toBe('张伟 · 研发部')
  })

  it('工号和部门含 HTML 时按纯文本显示', () => {
    const el = createCardElement(card({ employeeId: '<i>1</i>', department: '<b>x</b>' }), false)
    expect(el.querySelector('.details')?.children).toHaveLength(0)
    expect(el.querySelector('.details')?.textContent).toBe('<i>1</i>')
  })
})
