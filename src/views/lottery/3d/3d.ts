import {
  camera, scene, renderer, controls, // 3d 三大组件
  initCamera, initRenderer, initScene, initControls, // 初始化3d
  render, getContainerWidth, getContainerHeight, // 3d 其他
  objects, targets, cardSize, // 3d 变量
} from './3d-core';
export {
  camera, scene, renderer, controls, // 3d 三大组件
  initCamera, initRenderer, initScene, initControls, // 初始化3d
  render, // 3d 其他
  objects, targets, cardSize, // 3d 变量
}

import { transform, transformStatus, animate } from './3d-animate';
export { transform, transformStatus, animate };

import { create3DCard } from './3d-card-element';
import { targetsCoord } from './3d-card-coord';
export { rotateBall, rotateBallStop } from './3d-action';

// 窗口尺寸变化时同步相机宽高比与渲染器尺寸
function onWindowResize() {
  camera.aspect = getContainerWidth() / getContainerHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(getContainerWidth(), getContainerHeight());
  render();
}

let initialized = false;

function init() {
  if (initialized) return; // 幂等：StrictMode 开发态双调用 effect 时不重复建场景
  initialized = true;

  initCamera(); // 相机
  initScene(); // 场景

  create3DCard(); // 制作卡片3D对象的DOM
  targetsCoord(); // 计算table、sphere、helix、grid四个图形的坐标

  initRenderer(); // 渲染器
  initControls(); // 控制器

  // 初始化完成后再监听 resize：camera/renderer 已就绪，
  // 避免原来在模块顶层注册、init 前触发时引用未初始化对象而抛错
  window.addEventListener('resize', onWindowResize);
}

export { init };
