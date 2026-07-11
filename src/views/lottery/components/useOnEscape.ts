import { useEffect, useRef } from 'react'

// 按 Escape 关闭对话框/面板。用 ref 持有最新回调，只订阅一次全局按键。
// 当有确认框（.confirm-mask）叠在上面时不触发，避免 Escape 一次穿透关掉底层面板。
export function useOnEscape(onEscape: () => void): void {
  const ref = useRef(onEscape)
  useEffect(() => {
    ref.current = onEscape
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.confirm-mask')) {
        ref.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
