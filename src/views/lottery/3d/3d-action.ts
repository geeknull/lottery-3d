import { Tween, Easing } from '@tweenjs/tween.js';
import type { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { cardSize, objects, scene, camera, controls, render } from './3d-core';
import { Vector3 } from 'three';
import { getCameraZ, setCardDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';
import { rememberCameraView, resetCameraView } from './3d-camera-view';

function cardFlyAnimation(cardIndexList: number[]) {
  controls.enabled = false;
  return new Promise<void>((resolve) => {
    const selectObject: CSS3DObject[] = [];
    cardIndexList.forEach((item) => {
      selectObject.push(objects[item]);
    });
    const locates: { x: number; y: number }[] = [];
    const duration = 600;

    const selectRowCount = 1; // 行数 默认一行
    const cardPadding = 30;
    const objectLength = selectObject.length;
    const canvasSize = {
      width: (objectLength / selectRowCount + 1) * (cardSize.width + cardPadding),
      height: (selectRowCount + 1) * (cardSize.height + cardPadding)
    }

    // 计算中奖卡片位置
    const everyRowCount = Math.round(objectLength / selectRowCount);
    for (let i = 0; i < selectRowCount; i++) {
      const currentObjects = selectObject.slice(i * everyRowCount, (i+1) * everyRowCount);
      for (let j = 0; j < currentObjects.length; j++) {
        locates.push({
          x: ((cardSize.width + cardPadding) * (j + 1)) - (canvasSize.width / 2),
          y: -(cardSize.height + cardPadding) * (i + 1) + (canvasSize.height / 2)
        });
      }
    }

    const objectsWidth = (cardSize.width + cardPadding) * (selectObject.length / selectRowCount) - cardPadding;
    const objectsHeight = (cardSize.height + cardPadding) * selectRowCount - cardPadding;
    const cardDistZ = setCardDist(objectsWidth, objectsHeight);
    const revealDistance = camera.position.z;

    // 运行卡片动画
    selectObject.forEach((object, index) => {
      new Tween(object.position, tweenGroup)
        .to(
          {
            x: locates[index].x,
            y: locates[index].y,
            z: cardDistZ // z: 2200 // 原始默认
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
      .onComplete(() => {
        // 中奖卡片已经离开球面。窗口变窄后复位也必须看全这一排，
        // 不能按原球面距离把相机移到中奖卡片背后。
        rememberCameraView(() => ({
          target: new Vector3(),
          distance: Math.max(revealDistance, cardDistZ + getCameraZ(objectsWidth, objectsHeight)),
        }));
        void resetCameraView(0);
        resolve();
      });
  });
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
