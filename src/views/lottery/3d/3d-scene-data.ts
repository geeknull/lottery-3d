import type { Card } from '../core/lottery-types'

// 3D 层建卡/算位所需的数据，由 core 层在 init 时注入。
// 这样 3d 层不再反向 import lottery-config（打破 core↔3d 依赖环），
// 改由组件层（Lottery3d）读 core 状态、经 init 注入进来（组件依赖 core 是正常方向）。
export interface SceneData {
  cardList: Card[]
  colCount: number
  rowCount: number
  cardListWinAll: Card[]
}

let sceneData: SceneData | null = null

export function setSceneData(data: SceneData): void {
  sceneData = data
}

// 未注入即调用属编程错误（init 里会先 setSceneData）
export function getSceneData(): SceneData {
  if (!sceneData) {
    throw new Error('3D 场景数据未注入：请在 init 时先调用 setSceneData')
  }
  return sceneData
}
