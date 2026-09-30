import {
  camera, renderer, controls, initCamera, initRenderer, initScene, initControls,
  render, getContainerWidth, getContainerHeight, disposeCore,
} from './3d-core';
import { transform, transformStatus, animate, stopAnimation } from './3d-animate';
import { create3DCard } from './3d-card-element';
import { targetsCoord } from './3d-card-coord';
import { clearSceneData, setSceneData, type SceneData } from './3d-scene-data';
import { clearLayoutBounds } from './3d-calc-distance';
import { disposeCameraView } from './3d-camera-view';
import { disposeActions } from './3d-action';
import { tweenGroup } from './tween-group';
import { initIdleOrbit, disposeIdleOrbit } from './idle-orbit';

export {
  camera, scene, renderer, controls, initCamera, initRenderer, initScene, initControls,
  render, objects, targets, cardSize, getRenderStats,
} from './3d-core';
export { transform, transformStatus, animate };
export { rotateBall, rotateBallStop } from './3d-action';
export type { SceneData } from './3d-scene-data';

let initialized = false;
let observer: ResizeObserver | null = null;
let generation = 0;

function onWindowResize() {
  if (!initialized) return;
  const width = Math.max(1, getContainerWidth());
  const height = Math.max(1, getContainerHeight());
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  controls.handleResize();
  render();
}

function init(sceneData: SceneData) {
  if (initialized) return;
  initialized = true;
  generation++;
  setSceneData(sceneData);
  document.getElementById('container')?.classList.toggle('is-large-roster', sceneData.cardList.length >= 500);
  initCamera();
  initScene();
  create3DCard();
  targetsCoord();
  initRenderer();
  initControls();
  initIdleOrbit(document.getElementById('container')!);
  render();
  window.addEventListener('resize', onWindowResize);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(onWindowResize);
    observer.observe(document.getElementById('container')!);
  }
}

export function dispose() {
  if (!initialized) return;
  initialized = false;
  generation++;
  stopAnimation();
  disposeIdleOrbit();
  window.removeEventListener('resize', onWindowResize);
  observer?.disconnect();
  observer = null;
  disposeActions();
  disposeCameraView();
  // stop() settles lifecycle promises; removeAll() alone leaves callers waiting.
  for (const tween of tweenGroup.getAll()) tween.stop();
  tweenGroup.removeAll();
  disposeCore();
  clearLayoutBounds();
  clearSceneData();
  document.getElementById('container')?.classList.remove('is-large-roster');
}

// React owns this lease. The low-level exports remain for controller operations,
// but an obsolete StrictMode effect cannot dispose a newly mounted scene.
export function createLotteryScene(data: SceneData) {
  dispose();
  init(data);
  const owner = generation;
  animate();
  return {
    transform: (...args: Parameters<typeof transform>) => owner === generation ? transform(...args) : Promise.resolve(),
    dispose: () => { if (owner === generation) dispose(); },
  };
}

export { init };
