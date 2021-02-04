const TWEEN = window.TWEEN;
const THREE = window.THREE;
import { camera, cardSize } from './3d-core.js';
import lotteryConfig from './lottery-config.js';
const { colCount, rowCount } = lotteryConfig;

export const checkFixDirection = (canvasAspect, objectAspect) => {
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

export const getFitWidthZ = (width) => {
  const vFOV = THREE.Math.degToRad(camera.fov); // 垂直的全角视野
  const hFOV = 2 * Math.atan( Math.tan( vFOV / 2 ) * camera.aspect ); // 水平的全角视野
  const z = (width / 2) / Math.tan(hFOV / 2);
  return z;
};

export const getFitHeightZ = (height) => {
  const vFOV = THREE.Math.degToRad(camera.fov); // 垂直的全角视野
  const z = ( height / 2 ) / Math.tan(vFOV / 2);
  return z;
};

export const getFitSphereZ = (radius) => {
  // height / 2
  const z =  (radius) / (Math.sin( camera.fov * ( Math.PI / 180 ) / 2 ));
  return z;
};

export const zAnimate = async (z, duration) => {
  return new Promise((resolve, reject) => {
    let isDone = false;
    new TWEEN.Tween( camera.position )
      .to( { z: z }, duration )
      .easing( TWEEN.Easing.Exponential.InOut )
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

export const getCameraZ = (width, height, multiple = 1.05) => {
  let zPosition = null;
  // console.log(width, height);
  // debugger;
  const objectAspect = width / height;
  if (checkFixDirection(camera.aspect, objectAspect) === 'W') {
    zPosition = getFitWidthZ(width);
  } else {
    zPosition = getFitHeightZ(height);
  }
  // multiple = 1;
  // duration = 3000;
  const zPositionZoom = zPosition * multiple;
  return zPositionZoom;
}

export const setCameraZ = async (width, height, multiple = 1.05, duration = 0) => {
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

export const setCardDist = (cardWidth, cardHeight, multiple = 0.95) => {
  const z = getCameraZ(cardWidth, cardHeight, 1);
  const cardToCamera = camera.position.z - z;
  // multiple = 1;
  const cardDistZ = cardToCamera * multiple;
  return cardDistZ;
};
