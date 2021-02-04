const THREE = window.THREE;
const { CSS3DRenderer } = THREE;

// 3D: 渲染三大组件
const global3D = {};
global3D.camera = null;
global3D.scene = null;
global3D.renderer = null;
global3D.controls = null;
export let camera = global3D.camera;
export let scene = global3D.scene;
export let renderer = global3D.renderer;
export let controls = global3D.controls;

// 3d需要的数据
export const objects = []; // 3d卡片的对象
window.objects = objects;
export const targets = { table: [], sphere: [], helix: [], grid: [] }; // 四个不同状态的位置数据
// 卡片尺寸
export const cardSize = {
  width: 140,
  height: 180,
  padding: 20,
}

// 相机
const initCamera = function() {
  camera = new THREE.PerspectiveCamera( 40, getContainerWidth() / getContainerHeight(), 1, 10000 ); // 透视相机
  camera.position.z = 3000; // Z轴
  window.camera = global3D.camera = camera;
}

// 场景
const initScene = function() {
  scene = new THREE.Scene();
  window.scene = global3D.scene = scene;
}

// 渲染器
const initRenderer = function() {
  renderer = new CSS3DRenderer();
  renderer.setSize( getContainerWidth(), getContainerHeight() );
  document.getElementById( 'container' ).appendChild( renderer.domElement );
  window.renderer = global3D.renderer = renderer;
}

// 控制器
const { TrackballControls } = THREE;
const initControls = function() {
  controls = new TrackballControls( camera, renderer.domElement );
  controls.minDistance = 500;
  controls.maxDistance = 6000;
  controls.addEventListener( 'change', render );
  window.controls = global3D.controls = controls;
}

// 渲染
function render() {
  renderer.render( scene, camera );
}
window.render = render;

function getContainerWidth() {
  return document.getElementById( 'container' ).getBoundingClientRect().width;
}

function getContainerHeight() {
  return document.getElementById( 'container' ).getBoundingClientRect().height;
}

export {
  initCamera, initRenderer, initScene, initControls,
  render, global3D,
  getContainerWidth, getContainerHeight
}

export default global3D;
