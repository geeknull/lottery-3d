import mitt from 'mitt'
import type { Card } from './lottery-types'

// 替代 Vue 2 时代挂在 Vue.prototype.$bus 上的事件总线
export const bus = mitt<{
  'lottery-3d-init': undefined
  'lottery-win-reveal': { prizeName: string; prizeImg?: string; winners: Card[] } // 中奖卡片飞出定格后触发（彩带庆祝 + 揭晓横幅）
  'showcase-change': undefined // 轮播展示启停（按钮高亮态同步）
  'spin-change': boolean // 球体旋转抽奖启停（主操作按钮「开始抽奖 ↔ 停！」文案同步）
  'countdown': number // 倒计时当前数字（n>0 数字，0=GO，-1=隐藏）
}>()
