import { Group } from '@tweenjs/tween.js'

// 场景里的 Tween 创建后立即 start；此 group 只持有运行中（含暂停）的动画。
// tween.js v25 默认保留完成/停止的 Tween，长时间轮播会让每帧扫描越来越多旧对象。
// 先让库完成 update / onComplete，再统一清理，不覆盖调用方的回调或中断 Promise。
// 不使用已弃用的 update(time, false)：它还会自动启动未播放的 Tween。
class AnimationGroup extends Group {
  override update(time?: number): void {
    super.update(time)
    for (const tween of this.getAll()) {
      // pause 不改变 isPlaying，repeat 未结束时也保持 true。
      if (!tween.isPlaying()) this.remove(tween)
    }
  }
}

// 所有场景动画共享，由 3d-animate 的循环驱动；stop 后最迟下一帧释放。
export const tweenGroup = new AnimationGroup()
