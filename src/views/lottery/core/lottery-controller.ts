import { transform, transformStatus } from '../3d/3d-animate'
import { finishReveal, prepareSpin, revealWinners, rotateBall, rotateBallStop, showWinnerGroup, WINNER_GROUP_SIZE } from '../3d/3d-action'
import { resetCameraView } from '../3d/3d-camera-view'
import lotteryConfig from './lottery-config'
import { getRandomCard } from './lottery-algorithm'
import STATUS from './lottery-status'
import { toast } from '../components/feedback'
import { bus } from './event-bus'
import { stopShowcase } from './lottery-showcase'
import { ensureSeedCommit } from './lottery-fairness'
import { startSpinTicks, stopSpinTicks, playReveal } from './lottery-sound'
import { isCountdownEnabled, playCountdown } from './lottery-countdown'
import { notifyLotteryChange } from './lottery-store'
import type { Card, PrizePresentation } from './lottery-types'
import type { LotteryCommand } from './lottery-commands'

export type { LotteryCommand } from './lottery-commands'

export interface RevealResult {
  prizeId: string
  prizeName: string
  prizeImg?: string
  presentation: PrizePresentation
  winners: Card[]
  drawIndex: number
}

let lastReveal: RevealResult | null = null
let winnerGroupIndex: number | null = null
let presentation: { abort: AbortController; result: RevealResult } | null = null
let preparation: AbortController | null = null
let roundPresentation: PrizePresentation = 'standard'
let flowVersion = 0

export function isSpinning(): boolean { return STATUS.getPhase() === 'spinning' }

// 场景卸载使所有旧 await 失效，保留已经落盘的正式抽奖结果。
export function disposeControllerFlow(): void {
  flowVersion++
  const active = presentation
  presentation = null
  active?.abort.abort()
  preparation?.abort()
  preparation = null
  stopShowcase()
  stopSpinTicks()
  bus.emit('countdown', -1)
  STATUS.setPhase('init')
}

// 撤销/作废会使这批结果失效，不能重新展示为有效中奖。
export function getLastReveal(): RevealResult | null {
  if (!lastReveal) return null
  const entry = lotteryConfig.drawLog[lastReveal.drawIndex]
  const prize = lotteryConfig.getCurrentPrize(lastReveal.prizeId)
  if (!entry || entry.undone || !prize || lastReveal.winners.some(card => !prize.cardListWin.some(winner => winner.id === card.id))) return null
  return lastReveal
}

export function canReplayReveal(): boolean {
  return STATUS.isWait() && getLastReveal() !== null
}

export function getPresentationState() {
  const result = getLastReveal()
  return {
    phase: STATUS.getPhase(),
    winnerGroupIndex: result ? winnerGroupIndex : null,
    groupCount: result ? Math.ceil(result.winners.length / WINNER_GROUP_SIZE) : 0,
    replayAvailable: canReplayReveal(),
  }
}

function announceResult(result: RevealResult) {
  winnerGroupIndex = null
  STATUS.setPhase('presenting')
  playReveal()
  bus.emit('lottery-win-reveal', result)
}

async function playResult(result: RevealResult, replay = false): Promise<boolean> {
  const current = { abort: new AbortController(), result }
  presentation = current
  STATUS.setPhase('revealing')
  try {
    await revealWinners(result.winners.map(card => card.index), {
      signal: current.abort.signal, replay, presentation: result.presentation,
    })
    if (presentation !== current) return true
  } catch {
    if (presentation !== current) return true
    // 结果已经落盘。演出故障只能恢复同一份名单，不能重新抽取。
    try { await finishReveal(result.winners.map(card => card.index)) } catch { /* 保留历史和重放能力 */ }
    if (presentation !== current) return true
    toast('本轮结果已保存，展示恢复后可重放揭晓')
  }
  presentation = null
  announceResult(result)
  return true
}

async function start(): Promise<boolean> {
  stopShowcase()
  if (!STATUS.isWait()) return false
  const prize = lotteryConfig.getCurrentPrize()
  if (!prize) { toast('请选择奖项'); return false }
  if (prize.countRemain <= 0) { toast(prize.name + '已经抽取完毕，请选择其他奖项'); return false }
  if (!lotteryConfig.cardListRemainAll.length) { toast('奖池已抽取完毕'); return false }

  // 在第一次 await 前取得执行权，重复 start 不能叠加准备流程。
  roundPresentation = prize.presentation ?? 'standard'
  STATUS.setPhase('preparing')
  const version = flowVersion
  const abort = new AbortController()
  preparation = abort
  try {
    // 承诺先于旋转完成；结果在 stop 时只生成一次。
    await ensureSeedCommit()
    if (version !== flowVersion) return false
    if (transformStatus !== 'table') await transform('table', 500)
    if (version !== flowVersion) return false
    await transform('sphere', 300)
    if (version !== flowVersion) return false
    if (isCountdownEnabled() && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) await playCountdown(3, abort.signal)
    if (version !== flowVersion) return false
    await prepareSpin()
    if (version !== flowVersion) return false
    rotateBall()
    startSpinTicks()
    STATUS.setPhase('spinning')
    return true
  } catch {
    if (version !== flowVersion) return false
    stopSpinTicks()
    bus.emit('countdown', -1)
    try { await rotateBallStop() } catch { /* 允许重新开始 */ }
    if (version !== flowVersion) return false
    STATUS.setPhase('idle')
    toast('准备未完成，请重试开始抽奖')
    return false
  } finally {
    if (preparation === abort) preparation = null
  }
}

async function stop(): Promise<boolean> {
  if (!isSpinning()) return false
  // 同步加锁并固定结果。任何来源的第二个 stop 都在这里被挡住。
  STATUS.setPhase('revealing')
  stopSpinTicks()
  const version = flowVersion
  const prize = lotteryConfig.getCurrentPrize()
  if (!prize || !prize.countRemain || !lotteryConfig.cardListRemainAll.length) {
    try { await rotateBallStop() } catch { /* 恢复可操作状态 */ }
    if (version !== flowVersion) return false
    STATUS.setPhase('idle')
    toast('奖项或奖池不可用，请重新选择')
    return false
  }
  try {
    const winners = getRandomCard(prize)
    lastReveal = {
      prizeId: prize.id,
      prizeName: prize.name,
      prizeImg: prize.img || undefined,
      presentation: roundPresentation,
      winners: winners.map(card => ({ ...card })),
      drawIndex: lotteryConfig.drawLog.length - 1,
    }
    return await playResult(lastReveal)
  } catch {
    if (version !== flowVersion) return false
    try { await rotateBallStop() } catch { /* 避免永久忙碌 */ }
    if (version !== flowVersion) return false
    STATUS.setPhase('idle')
    toast('抽奖未完成，请检查本轮历史记录')
    return false
  }
}

async function skip(): Promise<boolean> {
  const current = presentation
  if (STATUS.getPhase() !== 'revealing' || !current) return false
  // 先撤销所有权，再 abort；旧 Promise 不能重复揭晓或覆盖新阶段。
  presentation = null
  current.abort.abort()
  const version = flowVersion
  try { await finishReveal(current.result.winners.map(card => card.index)) } catch {
    toast('结果已保存，可重放恢复展示')
  }
  if (version !== flowVersion) return false
  announceResult(current.result)
  return true
}

async function transition(work: () => Promise<void>, keepPresentation = false): Promise<boolean> {
  stopShowcase()
  if (!STATUS.isWait()) return false
  const previous = STATUS.getPhase()
  const version = flowVersion
  STATUS.setPhase('transitioning')
  try {
    await work()
    return version === flowVersion
  } catch {
    if (version === flowVersion) toast('展示调整未完成，请重试')
    return false
  } finally {
    if (version === flowVersion) STATUS.setPhase(keepPresentation && previous === 'presenting' ? 'presenting' : 'idle')
  }
}

async function select(prizeId: string): Promise<boolean> {
  if (!lotteryConfig.getCurrentPrize(prizeId)) return false
  return transition(async () => {
    lastReveal = null
    winnerGroupIndex = null
    lotteryConfig.currentPrize = prizeId
    notifyLotteryChange()
    await transform('table', 1000)
  })
}

async function group(action: 'winnerOverview' | 'winnerNextGroup' | 'winnerPreviousGroup'): Promise<boolean> {
  const result = getLastReveal()
  if (!result || STATUS.getPhase() !== 'presenting') return false
  const max = Math.ceil(result.winners.length / WINNER_GROUP_SIZE) - 1
  const next = action === 'winnerOverview' ? null : action === 'winnerNextGroup'
    ? Math.min(max, (winnerGroupIndex ?? -1) + 1)
    : Math.max(0, (winnerGroupIndex ?? 1) - 1)
  if (next === winnerGroupIndex) return false
  const version = flowVersion
  return transition(async () => {
    await showWinnerGroup(next)
    if (version === flowVersion) winnerGroupIndex = next
  }, true)
}

// 唯一命令入口：接线端不判断阶段，也不调用算法或 3D 操作。
export function dispatchLotteryCommand(command: LotteryCommand): Promise<boolean> {
  switch (command.action) {
    case 'start': return start()
    case 'stop': return stop()
    case 'toggleDraw': return isSpinning() ? stop() : start()
    case 'selectPrize': return select(command.prizeId)
    case 'resetView': return transition(() => resetCameraView(), true)
    case 'table': return transition(async () => { await transform('table', 1000); winnerGroupIndex = null })
    case 'skipReveal': return skip()
    case 'replayReveal': {
      stopShowcase()
      const result = getLastReveal()
      return canReplayReveal() && result ? playResult(result, true) : Promise.resolve(false)
    }
    case 'winnerOverview':
    case 'winnerNextGroup':
    case 'winnerPreviousGroup': return group(command.action)
  }
}

// 兼容组件已有的命名入口，规则全部收敛至 dispatchLotteryCommand。
export const lotteryStart = () => dispatchLotteryCommand({ action: 'start' })
export const lotteryStop = () => dispatchLotteryCommand({ action: 'stop' })
export const toggleDraw = () => dispatchLotteryCommand({ action: 'toggleDraw' })
export const selectPrize = (prizeId: string) => dispatchLotteryCommand({ action: 'selectPrize', prizeId })
export const resetView = () => dispatchLotteryCommand({ action: 'resetView' })
export const tableShow = () => dispatchLotteryCommand({ action: 'table' })
