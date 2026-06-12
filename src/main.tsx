import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './views/lottery/core/lottery-theme'
import { initPwaUpdate } from './views/lottery/core/pwa-update'
import { hydrateLotteryImages } from './views/lottery/core/config-images'
import './views/lottery/core/lottery-theme.scss'
import './app.scss'

// 首帧渲染前恢复持久化的主题，避免颜色闪变
initTheme()

// PWA：注册 service worker（断网可开），发现新版只提示、不自动刷新
void initPwaUpdate()

// 奖品图存在 IndexedDB（配置只存 idb: 引用），渲染前先解析成可显示的 dataURL，
// 避免组件首帧渲染到无效的 idb: src。无图用户立即返回，无感知。
await hydrateLotteryImages()

// 不开 StrictMode：3D 核心是模块级单例（scene/objects 都是模块状态），
// StrictMode 开发态双调用 effect 会初始化两套 3D 场景
createRoot(document.getElementById('app')!).render(<App />)
