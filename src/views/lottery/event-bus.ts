import mitt from 'mitt'

// 替代 Vue 2 时代挂在 Vue.prototype.$bus 上的事件总线
export const bus = mitt<{
  'lottery-3d-init': undefined
}>()
