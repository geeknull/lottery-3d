// https://threejs.org/examples/css3d_periodictable.html
import { useEffect } from 'react'
import '../3d/origin-main.css'
import '../3d/origin-periodictable.css'
import '../3d/lottery-custom.css'
import '../3d/lottery-3d.scss'
import { init, animate, transform } from '../3d/3d'
import { bus } from '../core/event-bus'

export default function Lottery3d() {
  useEffect(() => {
    (async () => {
      init()
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
