import { PerspectiveCamera, Scene } from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import type { Object3D } from 'three';

// 3D: 渲染三大组件
export interface Global3D {
  camera: PerspectiveCamera | null;
  scene: Scene | null;
  renderer: CSS3DRenderer | null;
  controls: TrackballControls | null;
}
const global3D: Global3D = {
  camera: null,
  scene: null,
  renderer: null,
  controls: null,
};
// init 系列函数会在使用前完成赋值
export let camera!: PerspectiveCamera;
export let scene!: Scene;
export let renderer!: CSS3DRenderer;
export let controls!: TrackballControls;

// 3d需要的数据
export const objects: CSS3DObject[] = []; // 3d卡片的对象
(window as any).objects = objects;
export const targets: Record<'table' | 'sphere' | 'helix' | 'grid', Object3D[]> = {
  table: [], sphere: [], helix: [], grid: []
}; // 四个不同状态的位置数据
// 卡片尺寸
export const cardSize = {
  width: 140,
  height: 180,
  padding: 20,
}

// 相机
const initCamera = function() {
  camera = new PerspectiveCamera( 40, getContainerWidth() / getContainerHeight(), 1, 10000 ); // 透视相机
  camera.position.z = 3000; // Z轴
  (window as any).camera = global3D.camera = camera;
}

// 场景
const initScene = function() {
  scene = new Scene();
  (window as any).scene = global3D.scene = scene;
}

// 渲染器
const initRenderer = function() {
  renderer = new CSS3DRenderer();
  renderer.setSize( getContainerWidth(), getContainerHeight() );
  document.getElementById( 'container' )!.appendChild( renderer.domElement );
  (window as any).renderer = global3D.renderer = renderer;
}

// 控制器
const initControls = function() {
  controls = new TrackballControls( camera, renderer.domElement );
  controls.minDistance = 500;
  controls.maxDistance = 6000;
  controls.addEventListener( 'change', render );
  (window as any).controls = global3D.controls = controls;
}

// 渲染
function render() {
  renderer.render( scene, camera );
}
(window as any).render = render;

function getContainerWidth() {
  return document.getElementById( 'container' )!.getBoundingClientRect().width;
}

function getContainerHeight() {
  return document.getElementById( 'container' )!.getBoundingClientRect().height;
}

export {
  initCamera, initRenderer, initScene, initControls,
  render, global3D,
  getContainerWidth, getContainerHeight
}

export default global3D;
