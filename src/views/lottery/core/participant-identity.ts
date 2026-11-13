// 参与者身份（工号、部门）的展示规则。只读名单，不改变名单顺序，不参与随机算法。
// 3d 层和组件都会用到，所以不 import lottery-config，名单由调用方传入。
import type { Card } from './lottery-types'

export type ParticipantIdentity = Pick<Card, 'name' | 'employeeId' | 'department'>

// 揭晓名单、横幅、喜报的显示名：只有名单里重名的人才加括号后缀，优先工号，没有工号用部门；
// 不重名或没有身份信息时只显示姓名。
export function createWinnerLabeler(roster: readonly ParticipantIdentity[]): (person: ParticipantIdentity) => string {
  const nameCount = new Map<string, number>()
  roster.forEach(person => nameCount.set(person.name, (nameCount.get(person.name) ?? 0) + 1))
  return person => {
    if ((nameCount.get(person.name) ?? 0) < 2) return person.name
    const tag = person.employeeId || person.department
    return tag ? `${person.name}（${tag}）` : person.name
  }
}

// 按卡片 ID 查身份。流水只存 ID 和名字，导出时用它补工号和部门。
export function identityById(roster: readonly Card[]): Map<string, Card> {
  return new Map(roster.map(card => [card.id, card]))
}

// 名单里是否有人带工号或部门
export function rosterHasIdentity(roster: readonly ParticipantIdentity[]): boolean {
  return roster.some(person => Boolean(person.employeeId || person.department))
}
