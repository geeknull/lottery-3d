import { beforeEach, describe, expect, it, vi } from 'vitest'

const stage = vi.hoisted(() => ({
  transform: vi.fn<() => Promise<void>>(),
  cancelLayout: vi.fn(),
  prepareSpin: vi.fn<() => Promise<void>>(),
  rotateBall: vi.fn(),
  rotateBallStop: vi.fn<() => Promise<void>>(),
  revealWinners: vi.fn<() => Promise<void>>(),
  finishReveal: vi.fn<() => Promise<void>>(),
  showWinnerGroup: vi.fn<() => Promise<void>>(),
  resetCameraView: vi.fn<() => Promise<void>>(),
}))
const sound = vi.hoisted(() => ({ startSpinTicks: vi.fn(), stopSpinTicks: vi.fn(), playReveal: vi.fn() }))
const countdown = vi.hoisted(() => ({ isCountdownEnabled: vi.fn(), playCountdown: vi.fn<() => Promise<void>>() }))
vi.mock('../3d/3d-animate', () => ({ transform: stage.transform, cancelLayout: stage.cancelLayout, transformStatus: 'table' }))
vi.mock('../3d/3d-action', () => ({ ...stage, WINNER_GROUP_SIZE: 6 }))
vi.mock('../3d/3d-camera-view', () => ({ resetCameraView: stage.resetCameraView }))
vi.mock('./lottery-sound', () => sound)
vi.mock('./lottery-countdown', () => countdown)
vi.mock('../components/feedback', () => ({ toast: vi.fn() }))

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

let controller: typeof import('./lottery-controller')
let config: typeof import('./lottery-config')['default']
let status: typeof import('./lottery-status')['default']
let bus: typeof import('./event-bus')['bus']

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  localStorage.clear()
  for (const fn of [stage.transform, stage.prepareSpin, stage.rotateBallStop, stage.revealWinners, stage.finishReveal, stage.showWinnerGroup, stage.resetCameraView, countdown.playCountdown]) fn.mockResolvedValue()
  countdown.isCountdownEnabled.mockReturnValue(false)
  ;({ default: config } = await import('./lottery-config'))
  ;({ default: status } = await import('./lottery-status'))
  ;({ bus } = await import('./event-bus'))
  controller = await import('./lottery-controller')
  config.currentPrize = config.prizeList[0].id
  status.setStatusWait()
})

describe('统一抽奖指令', () => {
  it('待机、初始化、准备中收到停止指令都不抽取或改写流水', async () => {
    await controller.lotteryStop()
    status.setStatus(status.INIT)
    await controller.dispatchLotteryCommand({ action: 'stop' })
    status.setStatusWait()
    const preparation = deferred()
    stage.transform.mockReturnValueOnce(preparation.promise)
    const starting = controller.lotteryStart()
    expect(status.getPhase()).toBe('preparing')
    await controller.lotteryStop()
    await controller.lotteryStart()
    expect(config.drawLog).toHaveLength(0)
    expect(stage.rotateBall).not.toHaveBeenCalled()
    preparation.resolve()
    await starting
    expect(status.getPhase()).toBe('spinning')
    expect(stage.rotateBall).toHaveBeenCalledTimes(1)
  })

  it('本地按钮、快捷键和远端停止在同轮重入时只保存一次结果', async () => {
    await controller.lotteryStart()
    const animation = deferred()
    stage.revealWinners.mockReturnValueOnce(animation.promise)
    const stopped = controller.lotteryStop()
    expect(status.getPhase()).toBe('revealing')
    await Promise.all([
      controller.dispatchLotteryCommand({ action: 'stop' }),
      controller.toggleDraw(),
      controller.lotteryStop(),
    ])
    expect(config.drawLog).toHaveLength(1)
    expect(config.prizeList[0].round).toBe(1)
    const saved = JSON.parse(localStorage.getItem('___lottery___')!)
    expect(saved.drawLog).toHaveLength(1)
    expect(stage.revealWinners).toHaveBeenCalledTimes(1)
    animation.resolve()
    await stopped
    expect(status.getPhase()).toBe('presenting')
    expect(controller.isSpinning()).toBe(false)
  })

  it('跳过后旧演出的迟到回调不重复揭晓，也不能覆盖下一轮状态', async () => {
    await controller.lotteryStart()
    const animation = deferred()
    stage.revealWinners.mockReturnValueOnce(animation.promise)
    const onReveal = vi.fn()
    bus.on('lottery-win-reveal', onReveal)
    const stopped = controller.lotteryStop()
    const result = controller.getLastReveal()!
    const rngAfterDraw = config.rngState
    await controller.dispatchLotteryCommand({ action: 'skipReveal' })
    expect(stage.finishReveal).toHaveBeenCalledWith(result.winners.map(card => card.index))
    expect(onReveal).toHaveBeenCalledTimes(1)
    await controller.lotteryStart()
    animation.resolve()
    await stopped
    expect(status.getPhase()).toBe('spinning')
    expect(onReveal).toHaveBeenCalledTimes(1)
    expect(config.rngState).toBe(rngAfterDraw)
    expect(config.drawLog).toHaveLength(1)
  })

  it('多次重放演出保留中奖人、奖项余额、随机状态和验证流水', async () => {
    await controller.lotteryStart()
    await controller.lotteryStop()
    const result = controller.getLastReveal()!
    const stored = localStorage.getItem('___lottery___')
    const rngState = config.rngState
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    expect(stage.revealWinners).toHaveBeenLastCalledWith(result.winners.map(card => card.index), expect.objectContaining({ replay: true }))
    expect(config.rngState).toBe(rngState)
    expect(config.drawLog).toHaveLength(1)
    expect(config.prizeList[0].round).toBe(1)
    expect(localStorage.getItem('___lottery___')).toBe(stored)
    const { verifyCurrent } = await import('./lottery-fairness')
    expect((await verifyCurrent()).ok).toBe(true)
  })

  it.each(['standard', 'ceremonial'] as const)('开始时锁定 %s 节奏，配置变化不改变本轮或重放', async presentation => {
    const prize = config.prizeList[0]
    prize.presentation = presentation
    const starting = controller.lotteryStart()
    prize.presentation = presentation === 'standard' ? 'ceremonial' : 'standard'
    await starting
    await controller.lotteryStop()
    expect(controller.getLastReveal()?.presentation).toBe(presentation)
    expect(stage.revealWinners).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ presentation, replay: false }))
    const stored = localStorage.getItem('___lottery___')
    const rngState = config.rngState
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    expect(stage.revealWinners).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ presentation, replay: true }))
    expect(config.rngState).toBe(rngState)
    expect(config.drawLog).toHaveLength(1)
    expect(localStorage.getItem('___lottery___')).toBe(stored)
  })

  it('旧配置缺少演出节奏时使用简洁模式，不从奖名猜测', async () => {
    delete config.prizeList[0].presentation
    config.prizeList[0].name = '年度终极特等奖'
    await controller.lotteryStart()
    await controller.lotteryStop()
    expect(controller.getLastReveal()?.presentation).toBe('standard')
    expect(stage.revealWinners).toHaveBeenLastCalledWith(expect.any(Array), expect.objectContaining({ presentation: 'standard' }))
  })

  it('收束期间仍是准备态，卸载后的旧收束完成不能开始旋转', async () => {
    const gathering = deferred()
    stage.prepareSpin.mockReturnValueOnce(gathering.promise)
    const starting = controller.lotteryStart()
    await vi.waitFor(() => expect(stage.prepareSpin).toHaveBeenCalledTimes(1))
    expect(status.getPhase()).toBe('preparing')
    await controller.lotteryStop()
    expect(config.drawLog).toHaveLength(0)
    controller.disposeControllerFlow()
    gathering.resolve()
    await starting
    expect(status.getPhase()).toBe('init')
    expect(stage.rotateBall).not.toHaveBeenCalled()
  })

  it('从轮播重放先停止旧布局，迟到的轮播不能覆盖揭晓定格', async () => {
    await controller.lotteryStart()
    await controller.lotteryStop()
    const { startShowcase, isShowcaseActive } = await import('./lottery-showcase')
    const oldLayout = deferred()
    stage.transform.mockReturnValueOnce(oldLayout.promise)
    const showcasing = startShowcase()
    expect(isShowcaseActive()).toBe(true)
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    expect(stage.cancelLayout).toHaveBeenCalledTimes(1)
    expect(isShowcaseActive()).toBe(false)
    expect(status.getPhase()).toBe('presenting')
    oldLayout.resolve()
    await showcasing
    expect(status.getPhase()).toBe('presenting')
    expect(config.drawLog).toHaveLength(1)
  })

  it('准备失败后可重试，停止指令不能替失败的准备生成结果', async () => {
    stage.transform.mockRejectedValueOnce(new Error('layout failed'))
    await controller.lotteryStart()
    expect(status.getPhase()).toBe('idle')
    await controller.lotteryStop()
    expect(config.drawLog).toHaveLength(0)
    await controller.lotteryStart()
    expect(status.getPhase()).toBe('spinning')
  })

  it('场景卸载使准备阶段失效，旧布局 Promise 不能重新启动旋转', async () => {
    const preparation = deferred()
    stage.transform.mockReturnValueOnce(preparation.promise)
    const starting = controller.lotteryStart()
    await vi.waitFor(() => expect(stage.transform).toHaveBeenCalled())
    controller.disposeControllerFlow()
    preparation.resolve()
    await starting
    expect(status.getPhase()).toBe('init')
    expect(stage.rotateBall).not.toHaveBeenCalled()
    expect(config.drawLog).toHaveLength(0)
  })

  it('场景卸载时保留已保存的开奖结果，旧动画不能发布揭晓', async () => {
    await controller.lotteryStart()
    const animation = deferred()
    stage.revealWinners.mockReturnValueOnce(animation.promise)
    const onReveal = vi.fn()
    bus.on('lottery-win-reveal', onReveal)
    const stopped = controller.lotteryStop()
    controller.disposeControllerFlow()
    animation.resolve()
    await stopped
    expect(status.getPhase()).toBe('init')
    expect(config.drawLog).toHaveLength(1)
    expect(onReveal).not.toHaveBeenCalled()
    status.setStatusWait()
    expect(controller.canReplayReveal()).toBe(true)
  })

  it('减少动态效果时跳过倒计时，仍完整锁定并保存开奖结果', async () => {
    countdown.isCountdownEnabled.mockReturnValue(true)
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    try {
      await controller.lotteryStart()
      await controller.lotteryStop()
      expect(countdown.playCountdown).not.toHaveBeenCalled()
      expect(config.drawLog).toHaveLength(1)
      expect(status.getPhase()).toBe('presenting')
    } finally {
      window.matchMedia = original
    }
  })

  it('演出失败后恢复同一批结果，可重放且不再抽取', async () => {
    await controller.lotteryStart()
    stage.revealWinners.mockRejectedValueOnce(new Error('animation failed'))
    await controller.lotteryStop()
    expect(status.getPhase()).toBe('presenting')
    expect(stage.finishReveal).toHaveBeenCalledTimes(1)
    expect(controller.canReplayReveal()).toBe(true)
    const result = controller.getLastReveal()
    await controller.lotteryStop()
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    expect(controller.getLastReveal()).toEqual(result)
    expect(config.drawLog).toHaveLength(1)
  })

  it('奖池为空不能开始，没有空开奖流水', async () => {
    config.cardListRemainAll = []
    await controller.lotteryStart()
    await controller.lotteryStop()
    expect(status.getPhase()).toBe('idle')
    expect(config.drawLog).toHaveLength(0)
  })

  it('撤销后的旧名单不允许重放为有效中奖', async () => {
    await controller.lotteryStart()
    await controller.lotteryStop()
    const { undoLastDraw } = await import('./lottery-algorithm')
    undoLastDraw()
    expect(controller.canReplayReveal()).toBe(false)
    await controller.dispatchLotteryCommand({ action: 'replayReveal' })
    expect(stage.revealWinners).toHaveBeenCalledTimes(1)
  })

  it('分组展示有边界且相机切换期间不能开始新轮或重复前进', async () => {
    config.currentPrize = config.prizeList.find(prize => prize.everyTimeGet === 10)!.id
    await controller.lotteryStart()
    await controller.lotteryStop()
    const rng = config.rngState
    const camera = deferred()
    stage.showWinnerGroup.mockReturnValueOnce(camera.promise)
    const next = controller.dispatchLotteryCommand({ action: 'winnerNextGroup' })
    await controller.dispatchLotteryCommand({ action: 'winnerNextGroup' })
    await controller.lotteryStart()
    expect(stage.showWinnerGroup).toHaveBeenCalledTimes(1)
    camera.resolve()
    await next
    expect(controller.getPresentationState().winnerGroupIndex).toBe(0)
    await controller.dispatchLotteryCommand({ action: 'winnerNextGroup' })
    await controller.dispatchLotteryCommand({ action: 'winnerNextGroup' })
    expect(controller.getPresentationState().winnerGroupIndex).toBe(1)
    await controller.dispatchLotteryCommand({ action: 'winnerOverview' })
    expect(controller.getPresentationState().winnerGroupIndex).toBeNull()
    expect(config.rngState).toBe(rng)
    expect(config.drawLog).toHaveLength(1)
  })

  it('切换奖项和复位失败后不会留下永久忙碌态', async () => {
    stage.transform.mockRejectedValueOnce(new Error('layout failed'))
    await controller.selectPrize(config.prizeList[1].id)
    expect(status.isWait()).toBe(true)
    stage.resetCameraView.mockRejectedValueOnce(new Error('camera failed'))
    await controller.resetView()
    expect(status.isWait()).toBe(true)
    await controller.lotteryStart()
    expect(controller.isSpinning()).toBe(true)
  })
})
