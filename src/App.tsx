import Lottery from './views/lottery/components/Lottery'
import LotteryControl from './views/lottery/components/LotteryControl'

// ?mode=control 渲染控制窗（遥控器），其余渲染展示窗（主界面/执行端）
export default function App() {
  const isControl = new URLSearchParams(window.location.search).get('mode') === 'control'
  return isControl ? <LotteryControl /> : <Lottery />
}
