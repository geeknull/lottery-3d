import { useEffect, useState, useRef } from 'react'
import { broadcastChannel, createDisplaySync, isDualScreenSupported, closeControlWindow, getDisplaySessionId, resetDisplaySessionId } from '../core/lottery-sync'
import type { DisplaySync } from '../core/lottery-sync'
import { buildSnapshot } from '../core/lottery-snapshot'
import lotteryConfig from '../core/lottery-config'
import { isSpinning, dispatchLotteryCommand, getPresentationState } from '../core/lottery-controller'
import { subscribeLottery } from '../core/lottery-store'
import { bus } from '../core/event-bus'
import STATUS from '../core/lottery-status'
import { isRehearsal } from '../core/rehearsal'

// 展示窗（执行端）的双屏接线：把控制窗命令映射到本地 controller 执行，并在状态变化时广播快照。
// 返回控制窗是否在线（用于自动隐藏操作 UI）+ exit（主屏一键退出双屏：关副屏 + 立即恢复操作 UI）。
export function useDisplaySync(): { connected: boolean; exit: () => void } {
  const [controlConnected, setControlConnected] = useState(false)
  const [sessionId, setSessionId] = useState(getDisplaySessionId)
  const syncRef = useRef<DisplaySync | null>(null)

  // 主屏一键退出：关闭副屏窗口，并立即恢复操作 UI（不必等 8 秒心跳超时）
  const exit = () => {
    closeControlWindow()
    setControlConnected(false)
    // 撤销旧配对（包括复制的控制页），并重建在线检测，支持立即重新连接。
    setSessionId(resetDisplaySessionId())
  }

  useEffect(() => {
    // 老浏览器无 BroadcastChannel：不挂双屏接线（否则 new BroadcastChannel 抛错会拖垮整个展示窗）
    if (isRehearsal() || !isDualScreenSupported()) {
      return void 0
    }

    const pushState = () =>
      syncRef.current?.postState(buildSnapshot(lotteryConfig, isSpinning(), getPresentationState()))

    const sync = createDisplaySync(broadcastChannel(sessionId), {
      onCommand(cmd) {
        if (cmd.action === 'requestState') pushState()
        else void dispatchLotteryCommand(cmd)
      },
      onConnectionChange: setControlConnected,
    }, sessionId)
    syncRef.current = sync

    // 任意状态变化都同步给控制窗
    const unsub = subscribeLottery(pushState) // 抽奖/选奖项/作废等数据变化
    const unsubPhase = STATUS.subscribe(pushState) // 准备/旋转/揭晓/定格/镜头变化
    bus.on('lottery-win-reveal', pushState) // 揭晓

    return () => {
      sync.close()
      unsub()
      unsubPhase()
      bus.off('lottery-win-reveal', pushState)
      syncRef.current = null
    }
  }, [sessionId])

  return { connected: controlConnected, exit }
}
