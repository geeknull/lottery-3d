import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import './lottery-error-boundary.scss'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// 渲染异常的最后防线：页面不能在投影上直接变白。
// 抽奖结果在揭晓前已经写入本机，这里只提示刷新，不做任何数据操作。
export default class LotteryErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('页面渲染失败', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="lottery-error-boundary" role="alert">
        <h1>页面出错了</h1>
        <p>已保存的抽奖进度不受影响，请刷新页面。如果反复出现，请把浏览器控制台的错误发给技术人员。</p>
        <button type="button" onClick={() => window.location.reload()}>刷新页面</button>
      </div>
    )
  }
}
