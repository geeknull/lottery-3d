// 开抽前公证卡：把承诺指纹整理成能投屏、打印、导出 PNG 的卡片数据。
// 纯函数，输入由调用方从当前场次读出，不 import lottery-config。
// 卡片是公开物：只放指纹、人数和奖项规则，不放种子、盐和姓名。

export type CommitKind = 'pending' | 'fnv' | 'unsalted' | 'salted'

export interface AttestationInput {
  title: string
  seedCommit: string
  seedSalt: string
  rosterCount: number
  prizes: { name: string; count: number; everyTimeGet: number }[]
  drawLog: { type: string }[]
  rehearsal: boolean
  now: Date
}

export interface Attestation {
  kind: 'unsalted' | 'salted'
  title: string
  groups: string[]
  rows: [string[], string[]]
  shortCode: string
  rosterLine: string
  prizeLines: string[]
  binding: string
  algorithm: string
  generatedAt: string
  timeNote: string
  verifySteps: string[]
  drawnRounds: number
  stageLabel: string
  watermark: string | null
}

export const ATTESTATION_TIME_NOTE = '本机时间，不能作为公布时间的证明'
export const REHEARSAL_WATERMARK = '彩排，不具效力'
export const UNSALTED_LABEL = '仅绑定种子，不绑定名单和奖项规则'
const GROUP_SIZE = 8

export function commitKind(seedCommit: string, seedSalt: string): CommitKind {
  if (!seedCommit) return 'pending'
  if (seedCommit.length === 8) return 'fnv'
  return seedSalt ? 'salted' : 'unsalted'
}

// 每 8 位一组，方便逐组对读。
export function groupFingerprint(hex: string): string[] {
  const groups: string[] = []
  for (let i = 0; i < hex.length; i += GROUP_SIZE) groups.push(hex.slice(i, i + GROUP_SIZE))
  return groups
}

// 不能出卡时返回给按钮旁显示的原因；能出卡返回 null。
export function attestationUnavailableReason(kind: CommitKind): string | null {
  if (kind === 'pending') return '指纹生成中，请稍候'
  if (kind === 'fnv') return '此环境只有非加密的 8 位指纹，请用 HTTPS 或 localhost 打开'
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocalTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 旧配置允许小数名额，原样显示，不取整。
function formatNumber(n: number): string {
  return String(n)
}

export function countDraws(drawLog: { type: string }[]): number {
  return drawLog.filter(entry => entry.type === 'draw').length
}

export function buildAttestation(input: AttestationInput): Attestation | null {
  const kind = commitKind(input.seedCommit, input.seedSalt)
  if (kind !== 'salted' && kind !== 'unsalted') return null
  const groups = groupFingerprint(input.seedCommit)
  const drawnRounds = countDraws(input.drawLog)
  return {
    kind,
    title: `${input.title} 开抽前公证卡`,
    groups,
    rows: [groups.slice(0, 4), groups.slice(4, 8)],
    shortCode: input.seedCommit.slice(0, GROUP_SIZE),
    rosterLine: `名单 ${input.rosterCount} 人`,
    prizeLines: input.prizes.map(p => `${p.name} × ${formatNumber(p.count)}（每轮 ${formatNumber(p.everyTimeGet)} 人）`),
    binding: kind === 'salted'
      ? '指纹绑定本场名单顺序与姓名，含工号（如有），以及奖项规则；修改名单或奖项会生成新指纹，需要重新公布。'
      : UNSALTED_LABEL,
    algorithm: kind === 'salted'
      ? '承诺 SHA-256（含随机盐）· 随机算法 mulberry32-v1'
      : '承诺 SHA-256（旧存档，无盐）· 随机算法 mulberry32-v1',
    generatedAt: formatLocalTime(input.now),
    timeNote: ATTESTATION_TIME_NOTE,
    verifySteps: [
      '1. 开抽后向主持人要“验证文件”。',
      '2. 在 🛡 公平性面板点“验证文件”导入。',
      '3. 面板显示的文件指纹应与本卡一致（可用“核对卡片指纹”输入框比对）。',
    ],
    drawnRounds,
    stageLabel: drawnRounds === 0 ? '开抽前' : `本场已抽 ${drawnRounds} 轮，此卡不是开抽前凭证`,
    watermark: input.rehearsal ? REHEARSAL_WATERMARK : null,
  }
}
