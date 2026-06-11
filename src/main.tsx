import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './views/lottery/lottery-theme'
import './views/lottery/lottery-theme.scss'
import './app.scss'

// 首帧渲染前恢复持久化的主题，避免颜色闪变
initTheme()

// 不开 StrictMode：3D 核心是模块级单例（scene/objects 都是模块状态），
// StrictMode 开发态双调用 effect 会初始化两套 3D 场景
createRoot(document.getElementById('app')!).render(<App />)
