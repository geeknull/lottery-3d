import { Quaternion, Vector3 } from 'three';
import { Easing, Tween } from '@tweenjs/tween.js';
import { camera, controls, initControls, render } from './3d-core';
import { tweenGroup } from './tween-group';
import { pauseIdleOrbit } from './idle-orbit';

export interface CameraView {
  target: Vector3;
  distance: number;
}

// 保存构图而非初始的固定 3000：布局与窗口尺寸变化后仍能正确复位。
let homeView: () => CameraView = () => ({ target: new Vector3(), distance: 3000 });
let cameraTween: Tween<{ progress: number }> | null = null;

export function cancelCameraView() {
  cameraTween?.stop();
  cameraTween = null;
}

export function disposeCameraView() {
  cancelCameraView();
  homeView = () => ({ target: new Vector3(), distance: 3000 });
}

export function rememberCameraView(view: () => CameraView) {
  homeView = view;
}

export function setCameraView(view: () => CameraView, duration = 0): Promise<void> {
  rememberCameraView(view);
  return resetCameraView(duration);
}

export function resetCameraView(duration = 450): Promise<void> {
  pauseIdleOrbit();
  // 被新的构图接替时也结束旧 Promise，不留下等待中的布局流程。
  cameraTween?.stop();
  const view = homeView();
  const position = view.target.clone().add(new Vector3(0, 0, view.distance));
  const startPosition = camera.position.clone();
  const startRotation = camera.quaternion.clone();
  const frontRotation = new Quaternion();
  controls.enabled = false;

  const finish = () => {
    // 复位动画期间也可能改变窗口尺寸，结束时按最新构图收拢。
    const currentView = homeView();
    camera.position.copy(currentView.target).add(new Vector3(0, 0, currentView.distance));
    camera.up.set(0, 1, 0);
    camera.quaternion.copy(frontRotation);
    camera.zoom = 1;
    camera.far = Math.max(10000, currentView.distance * 6);
    camera.updateProjectionMatrix();
    initControls(currentView.target, currentView.distance);
    render();
  };

  if (duration === 0 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return Promise.resolve();
  }

  return new Promise<void>(resolve => {
    const tween = new Tween({ progress: 0 }, tweenGroup)
      .to({ progress: 1 }, duration)
      .easing(Easing.Cubic.InOut)
      .onUpdate(({ progress }) => {
        camera.position.lerpVectors(startPosition, position, progress);
        camera.quaternion.slerpQuaternions(startRotation, frontRotation, progress);
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        render();
      })
      .onComplete(() => {
        tweenGroup.remove(tween);
        cameraTween = null;
        finish();
        resolve();
      })
      .onStop(() => {
        tweenGroup.remove(tween);
        cameraTween = null;
        resolve();
      })
      .start();
    cameraTween = tween;
  });
}
