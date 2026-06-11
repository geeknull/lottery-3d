import { useEffect, useState } from 'react'
import './feedback.scss'

// 界面内的轻提示与确认对话框，替代原生 alert/confirm。
// FeedbackHost 在应用根部挂载一次，toast/appConfirm 可在任意模块（含非组件代码）调用。

interface ToastItem {
  id: number
  message: string
}

interface ConfirmState {
  message: string
  confirmText: string
  cancelText: string
  resolve: (ok: boolean) => void
}

export interface ConfirmOptions {
  confirmText?: string
  cancelText?: string
}

interface HostApi {
  showToast(message: string, duration: number): void
  showConfirm(state: ConfirmState): void
}

let hostApi: HostApi | null = null

export function toast(message: string, duration = 3000): void {
  if (hostApi) {
    hostApi.showToast(message, duration)
  } else {
    window.alert(message) // Host 未挂载时兜底
  }
}

export function appConfirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const { confirmText = '确定', cancelText = '取消' } = options
  if (!hostApi) {
    return Promise.resolve(window.confirm(message)) // Host 未挂载时兜底
  }
  return new Promise<boolean>(resolve => {
    hostApi!.showConfirm({ message, confirmText, cancelText, resolve })
  })
}

let toastSeed = 0

export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    hostApi = {
      showToast(message, duration) {
        const id = ++toastSeed
        setToasts(prev => [...prev, { id, message }])
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id))
        }, duration)
      },
      showConfirm(state) {
        setConfirmState(state)
      },
    }
    return () => {
      hostApi = null
    }
  }, [])

  function closeConfirm(ok: boolean) {
    confirmState?.resolve(ok)
    setConfirmState(null)
  }

  return (
    <div className="feedback-host">
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map(t => (
            <div className="toast-item" key={t.id}>{t.message}</div>
          ))}
        </div>
      )}
      {confirmState && (
        <div className="confirm-mask">
          <div className="confirm-dialog">
            <p className="confirm-message">{confirmState.message}</p>
            <div className="confirm-btns">
              <button className="primary" onClick={() => closeConfirm(true)}>{confirmState.confirmText}</button>
              <button onClick={() => closeConfirm(false)}>{confirmState.cancelText}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
