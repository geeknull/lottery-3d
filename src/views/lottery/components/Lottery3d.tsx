// https://threejs.org/examples/css3d_periodictable.html
import { useEffect } from 'react'
import '../3d/origin-main.css'
import '../3d/origin-periodictable.css'
import '../3d/lottery-custom.css'
import '../3d/lottery-3d.scss'
import { init, animate, transform } from '../3d/3d'
import { bus } from '../core/event-bus'
import lotteryConfig from '../core/lottery-config'

export default function Lottery3d() {
  useEffect(() => {
    (async () => {
      // 组件层做 core→3d 接线：把名单/行列数注入 3D 层，3d 层自身不 import lottery-config
      init({
        cardList: lotteryConfig.cardList,
        colCount: lotteryConfig.colCount,
        rowCount: lotteryConfig.rowCount,
        cardListWinAll: lotteryConfig.cardListWinAll,
      })
      animate()
      await transform('table', 1000) // sphere
      bus.emit('lottery-3d-init')
    })()
  }, [])

  return (
    <div className="lottery-3d-wrap">
      <div id="container"></div>
    </div>
  )
}
