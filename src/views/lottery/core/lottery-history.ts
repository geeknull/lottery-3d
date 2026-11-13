// 抽奖历史时间线：把操作流水（抽奖/作废/撤销）转成可读行，并导出 CSV
import { escapeCsvCell } from './config-store'
import { identityById, rosterHasIdentity } from './participant-identity'
import type { Card, DrawLogEntry } from './lottery-types'

const TYPE_LABEL: Record<DrawLogEntry['type'], string> = {
  draw: '抽奖',
  void: '作废',
  undo: '撤销',
}

export interface HistoryRow {
  at: number
  time: string // HH:MM:SS
  type: DrawLogEntry['type']
  typeLabel: string
  prizeName: string
  names: string[]
  note?: string
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTime(at: number): string {
  const d = new Date(at)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function formatDateTime(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatTime(at)}`
}

// 流水转为时间线行，最新在前
export function toHistoryRows(drawLog: DrawLogEntry[]): HistoryRow[] {
  return drawLog
    .map((e): HistoryRow => ({
      at: e.at,
      time: formatTime(e.at),
      type: e.type,
      typeLabel: TYPE_LABEL[e.type],
      prizeName: e.prizeName,
      names: e.winnerNames,
      note: e.note,
    }))
    .reverse()
}

// 导出完整流水 CSV（每个涉及的人一行，带时间戳）。
// 流水只存 ID 和名字：名单（roster）有人带工号或部门时，按 winnerIds 查当前卡片，在末尾追加「工号,部门」，
// 不插到中间，已有按列取数的脚本不受影响；没有身份信息时与以前逐字节相同。
export function historyToCsv(drawLog: DrawLogEntry[], roster: readonly Card[] = []): string {
  const withIdentity = rosterHasIdentity(roster)
  const byId = identityById(roster)
  const rows = [withIdentity ? '时间,操作,奖项,姓名,备注,工号,部门' : '时间,操作,奖项,姓名,备注']
  drawLog.forEach(e => {
    const label = TYPE_LABEL[e.type]
    e.winnerNames.forEach((name, k) => {
      const cells = [formatDateTime(e.at), label, e.prizeName, name, e.note ?? '']
      if (withIdentity) {
        const card = byId.get(e.winnerIds[k])
        cells.push(card?.employeeId ?? '', card?.department ?? '')
      }
      rows.push(cells.map(escapeCsvCell).join(','))
    })
  })
  return '﻿' + rows.join('\n') // BOM
}

// 触发下载
export function exportHistoryCsv(drawLog: DrawLogEntry[], roster: readonly Card[] = []): void {
  const blob = new Blob([historyToCsv(drawLog, roster)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '抽奖流水.csv'
  a.click()
  URL.revokeObjectURL(url)
}
