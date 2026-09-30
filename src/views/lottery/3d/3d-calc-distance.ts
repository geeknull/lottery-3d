import { Box3, MathUtils, Vector3 } from 'three';
import { camera, cardSize, targets } from './3d-core';
import { getSceneData } from './3d-scene-data';
import { setCameraView } from './3d-camera-view';

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
  const halfVFov = MathUtils.degToRad(camera.fov) / 2;
  const halfHFov = Math.atan(Math.tan(halfVFov) * camera.aspect);
  return radius / Math.sin(Math.min(halfVFov, halfHFov));
};

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
  await setCameraView(() => ({ target: new Vector3(), distance: getCameraZ(width, height, multiple) }), duration);
}

export const setTableDist = async (multiple = 1.05, duration = 0) => {
  const { colCount, rowCount } = getSceneData();
  const objectsWidth = (cardSize.width + cardSize.padding) * colCount;
  const objectsHeight = (cardSize.height + cardSize.padding) * rowCount;
  return await setCameraZ(objectsWidth, objectsHeight, multiple, duration);
}

export const setSphereDist = async (multiple = 1.05, duration = 0) => {
  // 卡片有面积，不能只把球面上卡片中心当成可见边界。
  const radius = 800 + Math.hypot(cardSize.width, cardSize.height) / 2;
  return await setCameraView(() => ({ target: new Vector3(), distance: getFitSphereZ(radius) * multiple }), duration);
}

const layoutBounds = new Map<'helix' | 'grid', Box3>();

export function clearLayoutBounds() { layoutBounds.clear(); }

export const setLayoutDist = (type: 'helix' | 'grid', duration = 0) => {
  let bounds = layoutBounds.get(type);
  if (!bounds) {
    bounds = new Box3();
    for (const object of targets[type]) {
      for (const x of [-cardSize.width / 2, cardSize.width / 2]) {
        for (const y of [-cardSize.height / 2, cardSize.height / 2]) {
          bounds.expandByPoint(new Vector3(x, y, 0).applyQuaternion(object.quaternion).add(object.position));
        }
      }
    }
    layoutBounds.set(type, bounds);
  }
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  return setCameraView(() => ({
    target: center,
    distance: getCameraZ(size.x, size.y) + size.z / 2,
  }), duration);
};

export const setCardDist = (cardWidth: number, cardHeight: number, multiple = 0.95) => {
  const z = getCameraZ(cardWidth, cardHeight, 1);
  const cardToCamera = camera.position.z - z;
  const cardDistZ = cardToCamera * multiple;
  return cardDistZ;
};
