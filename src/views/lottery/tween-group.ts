import { Group } from '@tweenjs/tween.js'

// tween.js v25 起不再有全局默认 group，所有 Tween 统一挂到这个共享 group，
// 由 3d-animate 的 animate 循环驱动 update()
export const tweenGroup = new Group()
