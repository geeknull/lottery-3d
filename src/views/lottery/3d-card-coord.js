import lotteryConfig from './lottery-config.js';
const { cardList, colCount, rowCount } = lotteryConfig;
import {
  objects, targets, cardSize, // 3d 变量
} from './3d-core.js'

const THREE = window.THREE;

const defaultObj = {targets, objects, cardSize};
const targetsCoord = function ({targets, objects, cardSize} = defaultObj) {
  // table 平铺节点
  for ( let i = 0, l = objects.length; i < l; i ++ ) {
    const currentCardData = cardList[i];
    // if (!currentCardData) {
    //   console.log(currentCardData, cardList);
    //   debugger;
    // }
    const object = new THREE.Object3D();
    // 默认在中心点，需要减去总画布尺寸的一半
    object.position.x = ( currentCardData.col * (cardSize.width+20) ) - (((colCount+1) * (cardSize.width+20)) / 2);
    object.position.y = - ( currentCardData.row * (cardSize.height+20) ) + (((rowCount+1) * (cardSize.height+20)) / 2);

    targets.table.push( object );
  }

  // sphere 球体
  const vector = new THREE.Vector3();

  for ( let i = 0, l = objects.length; i < l; i ++ ) {
    const phi = Math.acos( - 1 + ( 2 * i ) / l );
    const theta = Math.sqrt( l * Math.PI ) * phi;

    const object = new THREE.Object3D();

    object.position.setFromSphericalCoords( 800, phi, theta );

    vector.copy( object.position ).multiplyScalar( 2 );

    object.lookAt( vector );

    targets.sphere.push( object );

  }

  // helix 螺旋
  for ( let i = 0, l = objects.length; i < l; i ++ ) {

    const theta = i * 0.175 + Math.PI;
    const y = - ( i * 8 ) + 450;

    const object = new THREE.Object3D();

    object.position.setFromCylindricalCoords( 900, theta, y );

    vector.x = object.position.x * 2;
    vector.y = object.position.y;
    vector.z = object.position.z * 2;

    object.lookAt( vector );

    targets.helix.push( object );

  }

  // grid 网格
  for ( let i = 0; i < objects.length; i ++ ) {

    const object = new THREE.Object3D();

    object.position.x = ( ( i % 5 ) * 400 ) - 800;
    object.position.y = ( - ( Math.floor( i / 5 ) % 5 ) * 400 ) + 800;
    object.position.z = ( Math.floor( i / 25 ) ) * 1000 - 2000;

    targets.grid.push( object );

  }
}
export { targetsCoord }
