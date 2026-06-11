import mitt from 'mitt'
import type { Card } from './lottery-types'

// 替代 Vue 2 时代挂在 Vue.prototype.$bus 上的事件总线
export const bus = mitt<{
  'lottery-3d-init': undefined
  'lottery-win-reveal': { prizeName: string; prizeImg?: string; winners: Card[] } // 中奖卡片飞出定格后触发（彩带庆祝 + 揭晓横幅）
  'showcase-change': undefined // 轮播展示启停（按钮高亮态同步）
}>()
