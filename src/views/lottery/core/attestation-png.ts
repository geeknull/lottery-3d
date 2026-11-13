// 公证卡 PNG：沿用 poster.ts 的做法，canvas 只画文字，不画任何外链图片，
// 不会被污染，toDataURL 不会抛 SecurityError。白底黑字，方便转发和打印。
import type { Attestation } from './attestation'
import { downloadDataUrl } from './poster'

const W = 1080
const PAD = 72
const DPR = 2
const SANS = '"PingFang SC", "Microsoft YaHei", sans-serif'
const MONO = '"SF Mono", Menlo, Consolas, monospace'
const RED = '#c62828'

type Block =
  | { kind: 'text'; text: string; size: number; bold?: boolean; color: string; align?: 'left' | 'center'; after: number }
  | { kind: 'groups'; groups: string[]; size: number; after: number }

function font(size: number, bold = false, family = SANS): string {
  return `${bold ? 'bold ' : ''}${size}px ${family}`
}

// 逐字折行，中文没有空格也能换行。
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > maxWidth) {
      lines.push(line)
      line = char
    } else {
      line += char
    }
  }
  lines.push(line)
  return lines
}

function blocks(card: Attestation): Block[] {
  const drawn = card.drawnRounds > 0
  const list: Block[] = [
    { kind: 'text', text: card.stageLabel, size: drawn ? 34 : 28, bold: drawn, color: drawn ? RED : '#2e7d32', after: 14 },
  ]
  if (card.watermark) list.push({ kind: 'text', text: card.watermark, size: 30, bold: true, color: RED, after: 14 })
  list.push(
    { kind: 'text', text: card.title, size: 44, bold: true, color: '#111', align: 'center', after: 30 },
    { kind: 'text', text: '承诺指纹', size: 24, color: '#555', after: 10 },
    { kind: 'groups', groups: card.rows[0], size: 40, after: 6 },
    { kind: 'groups', groups: card.rows[1], size: 40, after: 18 },
    { kind: 'text', text: `短码 ${card.shortCode}`, size: 30, bold: true, color: '#111', align: 'center', after: 28 },
  )
  if (card.kind === 'unsalted') list.push({ kind: 'text', text: `⚠ ${card.binding}`, size: 30, bold: true, color: '#8a5a00', after: 24 })
  list.push(
    { kind: 'text', text: card.rosterLine, size: 26, color: '#222', after: 12 },
    { kind: 'text', text: '奖项', size: 26, color: '#555', after: 6 },
    ...card.prizeLines.map((line): Block => ({ kind: 'text', text: `· ${line}`, size: 26, color: '#222', after: 6 })),
  )
  if (card.kind === 'salted') list.push({ kind: 'text', text: `绑定范围：${card.binding}`, size: 24, color: '#222', after: 12 })
  list.push(
    { kind: 'text', text: `算法：${card.algorithm}`, size: 24, color: '#222', after: 12 },
    { kind: 'text', text: `生成时间：${card.generatedAt}（${card.timeNote}）`, size: 24, color: '#222', after: 24 },
    { kind: 'text', text: '核对方法', size: 24, color: '#555', after: 6 },
    ...card.verifySteps.map((step): Block => ({ kind: 'text', text: step, size: 22, color: '#333', after: 4 })),
  )
  if (drawn) list.push({ kind: 'text', text: card.stageLabel, size: 30, bold: true, color: RED, after: 0 })
  return list
}

const lineHeight = (size: number) => Math.round(size * 1.45)

// 返回 PNG dataURL；canvas 不可用时返回 ''。
export function renderAttestationPng(card: Attestation): string {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const maxWidth = W - PAD * 2
  const list = blocks(card)

  // 先量高度：每块折行后的行数决定画布高度。
  const wrapped = list.map(block => {
    if (block.kind === 'groups') return [block.groups.join(' ')]
    ctx.font = font(block.size, block.bold)
    return wrap(ctx, block.text, maxWidth)
  })
  const height = PAD + list.reduce((sum, block, i) => sum + wrapped[i].length * lineHeight(block.size) + block.after, 0) + PAD

  canvas.width = W * DPR
  canvas.height = height * DPR
  ctx.scale(DPR, DPR)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, height)
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, W - 48, height - 48)

  if (card.watermark) {
    ctx.save()
    ctx.fillStyle = 'rgba(198, 40, 40, 0.12)'
    ctx.font = font(120, true)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.translate(W / 2, height / 2)
    ctx.rotate(-Math.PI / 8)
    for (let offset = -height; offset <= height; offset += 360) ctx.fillText(card.watermark, 0, offset)
    ctx.restore()
  }

  ctx.textBaseline = 'alphabetic'
  let y = PAD
  list.forEach((block, i) => {
    const lh = lineHeight(block.size)
    if (block.kind === 'groups') {
      // 每组单独画，组间留固定空隙；字体回退导致过宽时缩小字号。
      let size = block.size
      ctx.font = font(size, true, MONO)
      const gap = 36
      let width = block.groups.reduce((sum, g) => sum + ctx.measureText(g).width, 0) + gap * (block.groups.length - 1)
      if (width > maxWidth) {
        size = Math.floor(size * maxWidth / width)
        ctx.font = font(size, true, MONO)
        width = block.groups.reduce((sum, g) => sum + ctx.measureText(g).width, 0) + gap * (block.groups.length - 1)
      }
      ctx.fillStyle = '#000'
      ctx.textAlign = 'left'
      let x = (W - width) / 2
      for (const group of block.groups) {
        ctx.fillText(group, x, y + size)
        x += ctx.measureText(group).width + gap
      }
      y += lh + block.after
      return
    }
    ctx.font = font(block.size, block.bold)
    ctx.fillStyle = block.color
    ctx.textAlign = block.align ?? 'left'
    const x = block.align === 'center' ? W / 2 : PAD
    for (const line of wrapped[i]) {
      ctx.fillText(line, x, y + block.size)
      y += lh
    }
    y += block.after
  })

  return canvas.toDataURL('image/png')
}

export function attestationPngFilename(card: Attestation): string {
  return card.watermark ? `公证卡-彩排-${card.shortCode}.png` : `公证卡-${card.shortCode}.png`
}

// 导出失败（canvas 不可用）返回 false，由调用方提示。
export function exportAttestationPng(card: Attestation): boolean {
  const dataUrl = renderAttestationPng(card)
  if (!dataUrl || !dataUrl.startsWith('data:image/png')) return false
  downloadDataUrl(dataUrl, attestationPngFilename(card))
  return true
}
