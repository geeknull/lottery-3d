import { createRoot } from 'react-dom/client'
import App from './App'
import './app.scss'

// 不开 StrictMode：3D 核心是模块级单例（scene/objects 都是模块状态），
// StrictMode 开发态双调用 effect 会初始化两套 3D 场景
createRoot(document.getElementById('app')!).render(<App />)
