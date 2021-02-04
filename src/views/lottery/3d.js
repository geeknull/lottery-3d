import {
  camera, scene, renderer, controls, // 3d 三大组件
  initCamera, initRenderer, initScene, initControls, // 初始化3d
  render, global3D, // 3d 其他
  objects, targets, cardSize, // 3d 变量
} from './3d-core.js';
export {
  camera, scene, renderer, controls, // 3d 三大组件
  initCamera, initRenderer, initScene, initControls, // 初始化3d
  render, global3D, // 3d 其他
  objects, targets, cardSize, // 3d 变量
}

import { transform, transformStatus, animate } from './3d-animate.js';
export { transform, transformStatus, animate };

import { create3DCard } from './3d-card-element.js';
import { targetsCoord } from './3d-card-coord.js';
import { initEvent } from './3d-bind-event.js';
export { rotateBall, rotateBallStop } from './3d-action.js';

function init() {
  initCamera(); // 相机
  initScene(); // 场景

  create3DCard(); // 制作卡片3D对象的DOM
  targetsCoord(); // 计算table、sphere、helix、grid四个图形的坐标

  initRenderer(); // 渲染器
  initControls(); // 控制器

  // 防止DOM未加载 TODO 判断是否需要setTimeout
  setTimeout(() => {
    initEvent(); // 绑定事件
  }, 100)
}

export { init };
