import type { Object3D } from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { controls, render, objects, targets } from "./3d-core";
import { setTableDist, setSphereDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';

function animate() {
  requestAnimationFrame( animate );
  tweenGroup.update();
  controls.update();
}

export type TransformType = 'table' | 'sphere' | 'helix' | 'grid';

let transformStatus: TransformType | null = null;

// 将所有的卡片从一个状态转换到另一个状态
function transform( targetList: Object3D[], duration: number ) {
  return new Promise<void>((resolve) => {
    for ( let i = 0; i < objects.length; i ++ ) {
      const object = objects[ i ];
      const target = targetList[ i ];

      new Tween( object.position, tweenGroup )
        .to( { x: target.position.x, y: target.position.y, z: target.position.z }, Math.random() * duration + duration )
        .easing( Easing.Exponential.InOut )
        .start();

      new Tween( object.rotation, tweenGroup )
        .to( { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, Math.random() * duration + duration )
        .easing( Easing.Exponential.InOut )
        .start();
    }

    // 空对象 Tween 仅用作计时器，驱动渲染并在动画结束时 resolve
    new Tween( {}, tweenGroup )
      .to( {}, duration * 2 )
      .onUpdate( render )
      .start()
      .onComplete(() => {
        resolve();
      });
  });
}

async function transformTargets(type: TransformType, duration: number, distMultiple?: number) {
  switch (type) {
    case 'table':
      transformStatus = 'table';
      setTableDist(distMultiple); // 设置table的Z纵深
      await transform( targets.table, duration );
      break;
    case 'sphere':
      transformStatus = 'sphere';
      await Promise.all([
        setSphereDist(distMultiple, duration),
        transform( targets.sphere, duration ),
      ])
      break;
    case 'helix':
      transformStatus = 'helix';
      await transform( targets.helix, duration );
      break;
    case 'grid':
      transformStatus = 'grid';
      await transform( targets.grid, duration );
      break;
  }
}

export { transformTargets as transform }
export { animate, transformStatus }
