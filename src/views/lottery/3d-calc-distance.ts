import { MathUtils } from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { camera, cardSize } from './3d-core';
import { tweenGroup } from './tween-group';
import lotteryConfig from './lottery-config';

const { colCount, rowCount } = lotteryConfig;

export const checkFixDirection = (canvasAspect: number, objectAspect: number) => {
  // canvasAspect = canvasWidth / canvasHeight
  // objectAspect = objectWidth / objectHeight
  // Aspect大于1值越大说明越扁，为1是正方形，小于1很少见是很窄的图形

  if ( canvasAspect > objectAspect ) {
    // 画布比对象扁 object height fit to canvas height
    return 'H';
  } else {
    // 对象比画布扁 object width fit to canvas width
    return 'W';
  }
};

export const getFitWidthZ = (width: number) => {
  const vFOV = MathUtils.degToRad(camera.fov); // 垂直的全角视野
  const hFOV = 2 * Math.atan( Math.tan( vFOV / 2 ) * camera.aspect ); // 水平的全角视野
  const z = (width / 2) / Math.tan(hFOV / 2);
  return z;
};

export const getFitHeightZ = (height: number) => {
  const vFOV = MathUtils.degToRad(camera.fov); // 垂直的全角视野
  const z = ( height / 2 ) / Math.tan(vFOV / 2);
  return z;
};

export const getFitSphereZ = (radius: number) => {
  // height / 2
  const z =  (radius) / (Math.sin( camera.fov * ( Math.PI / 180 ) / 2 ));
  return z;
};

export const zAnimate = async (z: number, duration: number) => {
  return new Promise<void>((resolve) => {
    let isDone = false;
    new Tween( camera.position, tweenGroup )
      .to( { z: z }, duration )
      .easing( Easing.Exponential.InOut )
      .start()
      .onComplete(() => {
        resolve();
        isDone = true;
      });

    // 防止动画意外停止
    setTimeout(() => {
      if (isDone === false) {
        resolve();
      }
    }, 5000)
  });
}

export const getCameraZ = (width: number, height: number, multiple = 1.05) => {
  let zPosition: number;
  const objectAspect = width / height;
  if (checkFixDirection(camera.aspect, objectAspect) === 'W') {
    zPosition = getFitWidthZ(width);
  } else {
    zPosition = getFitHeightZ(height);
  }
  const zPositionZoom = zPosition * multiple;
  return zPositionZoom;
}

export const setCameraZ = async (width: number, height: number, multiple = 1.05, duration = 0) => {
  const z = getCameraZ(width, height, multiple);
  await zAnimate(z, duration);
}

export const setTableDist = async (multiple = 1.05, duration = 0) => {
  const objectsWidth = (cardSize.width + cardSize.padding) * colCount;
  const objectsHeight = (cardSize.height + cardSize.padding) * rowCount;
  return await setCameraZ(objectsWidth, objectsHeight, multiple, duration);
}

export const setSphereDist = async (multiple = 1.05, duration = 0) => {
  return await zAnimate(getFitSphereZ(800) * multiple, duration);
}

export const setCardDist = (cardWidth: number, cardHeight: number, multiple = 0.95) => {
  const z = getCameraZ(cardWidth, cardHeight, 1);
  const cardToCamera = camera.position.z - z;
  const cardDistZ = cardToCamera * multiple;
  return cardDistZ;
};
