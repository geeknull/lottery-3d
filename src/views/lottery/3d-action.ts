import { Tween, Easing } from '@tweenjs/tween.js';
import type { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { cardSize, objects, scene, render } from './3d-core';
import { setCardDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';

function cardFlyAnimation(cardIndexList: number[]) {
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

    // 运行卡片动画
    selectObject.forEach((object, index) => {
      const objectsWidth = (cardSize.width + cardPadding) * (selectObject.length / selectRowCount) - cardPadding;
      const objectsHeight = (cardSize.height + cardPadding) * selectRowCount - cardPadding;
      const cardDistZ = setCardDist(objectsWidth, objectsHeight);

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
        resolve();
      });
  });
}

// 旋转3D场景
function rotateBall() {
  const circleCount = 10000; // 1万圈
  const durationTime = 1000 * circleCount / 4;
  return new Promise<void>((resolve) => {
    scene.rotation.y = 0;
    new Tween(scene.rotation, tweenGroup)
      .to(
        {
          y: Math.PI * circleCount,
        },
        durationTime
      )
      .onUpdate(render)
      .easing(Easing.Linear.None)
      .start()
      .onComplete(() => {
        resolve();
      });
  });
}

// 停止旋转
function rotateBallStop() {
  tweenGroup.removeAll();
  setTimeout(() => {
    scene.rotation.x = 0;
    scene.rotation.y = 0;
    scene.rotation.z = 0;
    render();
  }, 0);
}

export { rotateBall, rotateBallStop, cardFlyAnimation }
