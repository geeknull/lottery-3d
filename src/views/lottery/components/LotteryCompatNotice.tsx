import { useState } from 'react'
import { detectEnv, checkCapabilities } from '../core/capability-check'
import './lottery-compat-notice.scss'

const DISMISS_KEY = '___lottery_compat_dismissed___'

// 启动时若检测到当前环境有功能受限（file:// / 内网 HTTP / 老浏览器），温和提示一次。
// 核心抽奖始终可用，所以这是信息性提示而非阻断；「知道了」后记住不再打扰。
export default function LotteryCompatNotice() {
  const [issues] = useState(() => checkCapabilities(detectEnv()))
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  if (issues.length === 0 || dismissed) {
    return null
  }

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* 隐私模式忽略 */
    }
    setDismissed(true)
  }

  return (
    <div className="lottery-compat-notice">
      <div className="compat-card">
        <h3>⚠ 浏览器兼容性提示</h3>
        <p className="compat-intro">
          检测到当前环境下以下功能受限，<strong>核心抽奖不受影响</strong>，可放心使用：
        </p>
        <ul className="compat-issues">
          {issues.map(i => (
            <li key={i.feature}>
              <span className="compat-feature">{i.feature}</span>
              {i.detail}
            </li>
          ))}
        </ul>
        <button className="compat-dismiss" onClick={handleDismiss}>知道了，继续使用</button>
      </div>
    </div>
  )
}
