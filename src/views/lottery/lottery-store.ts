import { useSyncExternalStore } from 'react'

// lotteryConfig 是模块级可变单例，React 感知不到它的变化。
// 这里用"版本号 + 订阅"把数据变化桥接到组件：
// 业务代码改完单例后调 notifyLotteryChange()，订阅了 useLotteryVersion 的组件随之重渲染。

let version = 0
const listeners = new Set<() => void>()

export function getLotteryVersion(): number {
  return version
}

export function notifyLotteryChange(): void {
  version++
  listeners.forEach(listener => listener())
}

export function subscribeLottery(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useLotteryVersion(): number {
  return useSyncExternalStore(subscribeLottery, getLotteryVersion)
}
