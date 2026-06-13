import { useEffect, useState, useRef } from 'react'
import { broadcastChannel, createDisplaySync, isDualScreenSupported, closeControlWindow } from '../core/lottery-sync'
import type { DisplaySync } from '../core/lottery-sync'
import { buildSnapshot } from '../core/lottery-snapshot'
import lotteryConfig from '../core/lottery-config'
import { isSpinning, selectPrize, lotteryStart, lotteryStop } from '../core/lottery-controller'
import { subscribeLottery } from '../core/lottery-store'
import { bus } from '../core/event-bus'

// 展示窗（执行端）的双屏接线：把控制窗命令映射到本地 controller 执行，并在状态变化时广播快照。
// 返回控制窗是否在线（用于自动隐藏操作 UI）+ exit（主屏一键退出双屏：关副屏 + 立即恢复操作 UI）。
export function useDisplaySync(): { connected: boolean; exit: () => void } {
  const [controlConnected, setControlConnected] = useState(false)
  const syncRef = useRef<DisplaySync | null>(null)

  // 主屏一键退出：关闭副屏窗口，并立即恢复操作 UI（不必等 8 秒心跳超时）
  const exit = () => {
    closeControlWindow()
    setControlConnected(false)
  }

  useEffect(() => {
    // 老浏览器无 BroadcastChannel：不挂双屏接线（否则 new BroadcastChannel 抛错会拖垮整个展示窗）
    if (!isDualScreenSupported()) {
      return void 0
    }

    const pushState = () =>
      syncRef.current?.postState(buildSnapshot(lotteryConfig, isSpinning()))

    const sync = createDisplaySync(broadcastChannel(), {
      onCommand(cmd) {
        switch (cmd.action) {
          case 'selectPrize': void selectPrize(cmd.prizeId); break
          case 'start': void lotteryStart(); break
          case 'stop': void lotteryStop(); break
          case 'requestState': pushState(); break // 握手：立即回发当前状态
        }
      },
      onConnectionChange: setControlConnected,
    })
    syncRef.current = sync

    // 任意状态变化都同步给控制窗
    const unsub = subscribeLottery(pushState) // 抽奖/选奖项/作废等数据变化
    bus.on('spin-change', pushState) // 开始/停旋转
    bus.on('lottery-win-reveal', pushState) // 揭晓

    return () => {
      sync.close()
      unsub()
      bus.off('spin-change', pushState)
      bus.off('lottery-win-reveal', pushState)
      syncRef.current = null
    }
  }, [])

  return { connected: controlConnected, exit }
}
