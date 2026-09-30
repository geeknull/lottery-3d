import { Tween, Easing } from '@tweenjs/tween.js';
import { cardSize, objects, scene, camera, controls, render, getContainerWidth, getContainerHeight } from './3d-core';
import { Vector3 } from 'three';
import { getFitWidthZ, getFitHeightZ, setCardDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';
import { rememberCameraView, resetCameraView, setCameraView } from './3d-camera-view';
import { getWinnerLayout } from './3d-winner-layout';

function getWinnerComposition(count: number) {
  const width = getContainerWidth();
  const height = getContainerHeight();
  // 留出边缘呼吸空间和底部复位按钮的位置，矮窗口也不会遮住中奖姓名。
  const availableWidth = Math.max(1, width - Math.min(64, width / 4));
  const availableHeight = Math.max(1, height - Math.min(160, height / 3));
  const layout = getWinnerLayout(count, availableWidth / availableHeight, cardSize);
  const distance = Math.max(
    getFitWidthZ(layout.width) * width / availableWidth,
    getFitHeightZ(layout.height) * height / availableHeight,
  );
  return { ...layout, distance };
}

async function cardFlyAnimation(cardIndexList: number[]) {
  if (cardIndexList.length === 0) return;

  const selectedObjects = cardIndexList.map(index => objects[index]);
  const selectedSet = new Set(selectedObjects);
  for (const object of objects) {
    object.element.classList.toggle('winner-background', !selectedSet.has(object));
  }
  const layout = getWinnerComposition(selectedObjects.length);
  const revealDistance = camera.position.z;
  // 大批中奖者也必须飞到背景卡片前方，不能为了入镜退到球体里面。
  const frontZ = objects.reduce((z, object) => Math.max(z, object.position.z), 0)
    + Math.hypot(cardSize.width, cardSize.height) / 2 + 30;
  const winnerZ = Math.max(frontZ, setCardDist(layout.width, layout.height));
  const winnerView = (distance: number) => ({
    target: new Vector3(0, 0, winnerZ),
    distance: Math.max(revealDistance - winnerZ, distance),
  });
  const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 600;
  const cameraMove = setCameraView(() => winnerView(layout.distance), duration * 2)
    .then(() => { controls.enabled = false; });
  // 相机可能先完成（包括减少动态效果模式），飞卡期间仍由程序持有视角。
  controls.enabled = false;
  await Promise.all([
    cameraMove,
    new Promise<void>((resolve) => {
      // 运行卡片动画
      selectedObjects.forEach((object, index) => {
        new Tween(object.position, tweenGroup)
          .to(
            {
              ...layout.positions[index],
              z: winnerZ,
            },
            Math.random() * duration + duration
          )
          .easing(Easing.Exponential.InOut)
          .start();

        new Tween(object.rotation, tweenGroup)
          .to(
            { x: 0, y: 0, z: 0 },
            Math.random() * duration + duration
          )
          .easing(Easing.Exponential.InOut)
          .start();

        object.element.classList.add("prize");
      });

      // 空对象 Tween 仅用作计时器，驱动渲染并在动画结束时 resolve
      new Tween({}, tweenGroup)
        .to({}, duration * 2)
        .onUpdate(render)
        .start()
        .onComplete(() => resolve());
    }),
  ]);

  // 揭晓结束及之后每次复位，都按最新画布重排；切换布局会替换此构图。
  // 使用揭晓时的固定深度，避免拖拽相机后反复复位导致卡片越移越远。
  rememberCameraView(() => {
    const current = getWinnerComposition(selectedObjects.length);
    selectedObjects.forEach((object, index) => {
      object.position.set(current.positions[index].x, current.positions[index].y, winnerZ);
    });
    return winnerView(current.distance);
  });
  await resetCameraView(0);
}

// 持有当前旋转 tween，停止时只停它自己，不用 removeAll 一刀切
let spinTween: Tween<{ a: number }> | null = null;

// 旋转3D球：相机绕 Y 轴公转，而非旋转 scene/卡片对象。
// CSS3DRenderer 把相机变换作用在单个父容器元素上，每张卡片的 matrix3d 只依赖它
// 自身的世界矩阵；相机公转时卡片世界矩阵不变 → 渲染器命中缓存、跳过全部卡片的
// DOM transform 写入，每帧只改 1 个元素。相比旋转 scene.rotation 每帧重写 N 个
// 卡片 transform，大名单旋转帧率大幅提升（瓶颈是合成层/DOM 写入随卡片数线性增长）。
// 旋转是无限循环、由停止操作打断，不返回 Promise（原来 onComplete 永不触发、是死代码）。
function rotateBall() {
  // 倒计时期间仍可拖拽；真正开抽前重新居中并清除手势惯性。
  void resetCameraView(0);
  const circleCount = 10000; // 1万圈
  const durationTime = 1000 * circleCount / 4;
  // 沿当前球体构图的半径绕中心公转。
  const radius = Math.hypot(camera.position.x, camera.position.z) || camera.position.z;
  const startAngle = Math.atan2(camera.position.x, camera.position.z);
  const height = camera.position.y;
  controls.enabled = false; // 公转期间不让 TrackballControls 抢相机
  const spin = { a: 0 };
  spinTween = new Tween(spin, tweenGroup)
    .to({ a: Math.PI * 2 * circleCount }, durationTime)
    .onUpdate(() => {
      const angle = startAngle + spin.a;
      camera.position.set(radius * Math.sin(angle), height, radius * Math.cos(angle));
      camera.lookAt(scene.position); // 始终看向球心
      render();
    })
    .easing(Easing.Linear.None)
    .start();
}

// 停止旋转：只停旋转 tween 本身（不用 tweenGroup.removeAll——那会连带杀掉别处
// 正在跑的 tween 且不触发其 onComplete）。
// 相机复位到正前方看向中心，让中奖卡片朝观众飞出。
function rotateBallStop() {
  spinTween?.stop();
  if (spinTween) tweenGroup.remove(spinTween);
  spinTween = null;
  void resetCameraView(0);
}

export { rotateBall, rotateBallStop, cardFlyAnimation }
