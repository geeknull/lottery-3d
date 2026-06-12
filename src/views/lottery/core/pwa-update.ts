// PWA 更新状态机：Service Worker 检测到新版时不自动刷新，而是提示用户择机更新。
// 年会抽奖中途被刷新会打断动画，所以用提示式而非 autoUpdate。

type Listener = (needRefresh: boolean) => void

let needRefresh = false
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<Listener>()

const CHECK_INTERVAL = 5 * 60 * 1000 // 每 5 分钟后台检查一次新版

export function getNeedRefresh(): boolean {
  return needRefresh
}

export function subscribeUpdate(l: Listener): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// SW 发现新版本时调用：置位并通知所有订阅者
export function markNeedRefresh(): void {
  needRefresh = true
  listeners.forEach(l => l(true))
}

// 注入真正的 updateSW 函数（init 与测试共用）
export function _setUpdateSW(fn: (reloadPage?: boolean) => Promise<void>): void {
  updateSWFn = fn
}

// 用户点击「立即更新」：激活等待中的新 SW 并重载到最新版
export function applyUpdate(): void {
  void updateSWFn?.(true)
}

// 注册 SW：发现新版只提示，并周期性后台检查更新
export async function initPwaUpdate(): Promise<void> {
  const { registerSW } = await import('virtual:pwa-register')
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      markNeedRefresh()
    },
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          void registration.update()
        }, CHECK_INTERVAL)
      }
    },
  })
  _setUpdateSW(updateSW)
}
