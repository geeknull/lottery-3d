// 本地按钮、快捷键和配对控制窗共享意图；阶段规则只在 controller 判定。
export type LotteryCommand =
  | { action: 'start' }
  | { action: 'stop' }
  | { action: 'toggleDraw' }
  | { action: 'selectPrize'; prizeId: string }
  | { action: 'resetView' }
  | { action: 'table' }
  | { action: 'skipReveal' }
  | { action: 'replayReveal' }
  | { action: 'winnerOverview' }
  | { action: 'winnerNextGroup' }
  | { action: 'winnerPreviousGroup' }
