import lotteryConfig from './lottery-config'
import type { Prize } from './lottery-types'

// 中奖喜报海报：canvas 绘制活动标题 + 各奖项中奖名单，导出 PNG 供开完奖转发到群里。
// 纯文字版（不画头像）——头像多为 http 外链，drawImage 后 canvas 会被 taint，
// toDataURL 直接抛 SecurityError 导致导出失败。头像版留作将来增强。

const W = 1080 // 适合手机竖屏分享
const PAD = 64
const COLS = 4 // 中奖人每行列数

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

// 触发浏览器下载 dataURL
function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

// 预估各奖项占高，算出海报总高（标题区 + 每奖项标题行 + 名单网格行）
function measureHeight(prizes: Prize[]): number {
  let h = 230 // 顶部标题区
  for (const p of prizes) {
    const rows = Math.ceil(p.cardListWin.length / COLS)
    h += 70 + rows * 64 + 36 // 奖项名 + 名单行 + 间距
  }
  return h + 80 // 底部留白
}

// 绘制海报，返回 PNG dataURL；canvas 不可用时返回 ''
function renderPoster(title: string, prizes: Prize[]): string {
  const dpr = 2
  const height = measureHeight(prizes)
  const canvas = document.createElement('canvas')
  canvas.width = W * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return ''
  }
  ctx.scale(dpr, dpr)

  const glow = cssVar('--accent-glow-rgb', '64, 224, 208')
  const light = cssVar('--accent-light-rgb', '120, 220, 255')

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#04141c')
  bg.addColorStop(1, '#02080c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, height)

  // 顶部标题
  ctx.textAlign = 'center'
  ctx.fillStyle = `rgb(${glow})`
  ctx.font = 'bold 30px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText('🎉 中奖喜报 🎉', W / 2, 96)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 46px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(title, W / 2, 162)
  // 分隔线
  ctx.strokeStyle = `rgba(${light}, 0.35)`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(PAD, 200)
  ctx.lineTo(W - PAD, 200)
  ctx.stroke()

  // 各奖项
  let y = 270
  const colW = (W - PAD * 2) / COLS
  for (const p of prizes) {
    ctx.textAlign = 'left'
    ctx.fillStyle = `rgb(${light})`
    ctx.font = 'bold 32px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(`${p.name}（${p.cardListWin.length}）`, PAD, y)
    y += 56

    ctx.fillStyle = '#e8f4f8'
    ctx.font = '26px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'
    p.cardListWin.forEach((c, i) => {
      const col = i % COLS
      const row = Math.floor(i / COLS)
      const cx = PAD + col * colW + colW / 2
      const cy = y + row * 64
      ctx.fillText(c.name, cx, cy)
    })
    y += Math.ceil(p.cardListWin.length / COLS) * 64 + 36
  }

  return canvas.toDataURL('image/png')
}

// 导出中奖喜报海报。无中奖记录返回 false（调用方提示）。
export function exportWinnersPoster(): boolean {
  const prizes = lotteryConfig.prizeList.filter(p => p.cardListWin.length > 0)
  if (prizes.length === 0) {
    return false
  }
  const dataUrl = renderPoster(lotteryConfig.headerTitle, prizes)
  if (!dataUrl || dataUrl.length < 10) {
    return false
  }
  downloadDataUrl(dataUrl, '中奖喜报.png')
  return true
}
