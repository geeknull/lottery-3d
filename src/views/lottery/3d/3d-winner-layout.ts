interface WinnerLayout {
  width: number
  height: number
  positions: { x: number; y: number }[]
}

// 同一相机视角下，所需的取景高度越小，中奖卡片在屏幕上就越大。
export function getWinnerLayout(
  count: number,
  aspect: number,
  cardSize: { width: number; height: number },
  gap = 30,
): WinnerLayout {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (total === 0) return { width: 0, height: 0, positions: [] }

  const viewportAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  let bestColumns = 1
  let bestRows = total
  let bestWidth = cardSize.width
  let bestHeight = total * cardSize.height + (total - 1) * gap
  let bestFit = Infinity
  let bestEmpty = Infinity

  for (let columns = 1; columns <= total; columns++) {
    const rows = Math.ceil(total / columns)
    const width = columns * cardSize.width + (columns - 1) * gap
    const height = rows * cardSize.height + (rows - 1) * gap
    // 窄视口将 max(width / aspect, height) 整体乘以 aspect，避免极小比例除法溢出。
    const fit = viewportAspect < 1
      ? Math.max(width, height * viewportAspect)
      : Math.max(width / viewportAspect, height)
    const empty = columns * rows - total
    if (fit < bestFit || (fit === bestFit && (empty < bestEmpty || (empty === bestEmpty && rows < bestRows)))) {
      bestColumns = columns
      bestRows = rows
      bestWidth = width
      bestHeight = height
      bestFit = fit
      bestEmpty = empty
    }
  }

  const positions = Array.from({ length: total }, (_, index) => {
    const row = Math.floor(index / bestColumns)
    const column = index % bestColumns
    const cardsInRow = Math.min(bestColumns, total - row * bestColumns)
    return {
      x: (column - (cardsInRow - 1) / 2) * (cardSize.width + gap),
      y: ((bestRows - 1) / 2 - row) * (cardSize.height + gap),
    }
  })

  return { width: bestWidth, height: bestHeight, positions }
}
