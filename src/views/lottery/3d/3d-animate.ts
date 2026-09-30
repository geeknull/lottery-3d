import type { Object3D } from 'three';
import { Tween, Easing } from '@tweenjs/tween.js';
import { controls, render, flushRender, objects, targets } from './3d-core';
import { setTableDist, setSphereDist, setLayoutDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';
import { prefersReducedMotion } from './stage-motion';
import { cancelCameraView } from './3d-camera-view';
import { setIdleLayout, updateIdleOrbit } from './idle-orbit';

let frameId: number | null = null;
let animating = false;

function animate() {
  if (animating) return;
  animating = true;
  frameId = requestAnimationFrame(loop);
}

function loop(time: number) {
  if (!animating) return;
  tweenGroup.update(time);
  // TrackballControls.enabled blocks input, but update still applies inertia.
  if (controls.enabled) controls.update();
  updateIdleOrbit(time);
  flushRender();
  frameId = requestAnimationFrame(loop);
}

export function stopAnimation() {
  animating = false;
  if (frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  transformStatus = null;
  layoutVersion++;
  setIdleLayout(null);
}

export type TransformType = 'table' | 'sphere' | 'helix' | 'grid';
let transformStatus: TransformType | null = null;
let layoutVersion = 0;
let layoutTween: Tween<{ elapsed: number }> | null = null;

export function cancelLayout() {
  layoutVersion++;
  setIdleLayout(null);
  layoutTween?.stop();
  cancelCameraView();
}

// One clock drives all cards: keep only one Tween instead of 2N independent
// clocks, while still giving each card a short, deterministic stagger.
function moveCards(targetList: Object3D[], duration: number) {
  layoutTween?.stop();
  const start = objects.map(object => ({ position: object.position.clone(), rotation: object.rotation.clone() }));
  for (const object of objects) {
    object.visible = true;
    object.element.classList.remove('winner-background', 'winner-current');
  }
  const place = (elapsed: number) => {
    objects.forEach((object, index) => {
      const target = targetList[index];
      if (!target) return;
      const progress = duration === 0 ? 1 : Easing.Exponential.InOut(Math.min(1, Math.max(0, (elapsed - (index % 17) / 17 * duration) / duration)));
      object.position.lerpVectors(start[index].position, target.position, progress);
      object.rotation.set(
        start[index].rotation.x + (target.rotation.x - start[index].rotation.x) * progress,
        start[index].rotation.y + (target.rotation.y - start[index].rotation.y) * progress,
        start[index].rotation.z + (target.rotation.z - start[index].rotation.z) * progress,
      );
    });
    render();
  };
  if (duration === 0) { place(0); return Promise.resolve(); }
  return new Promise<void>(resolve => {
    const tween = new Tween({ elapsed: 0 }, tweenGroup)
      .to({ elapsed: duration * 2 }, duration * 2)
      .onUpdate(({ elapsed }) => place(elapsed))
      .onComplete(() => { tweenGroup.remove(tween); layoutTween = null; resolve(); })
      .onStop(() => { tweenGroup.remove(tween); layoutTween = null; resolve(); })
      .start();
    layoutTween = tween;
  });
}

async function transformTargets(type: TransformType, duration: number, distMultiple?: number) {
  const version = ++layoutVersion;
  setIdleLayout(null);
  duration = prefersReducedMotion() ? 0 : duration;
  transformStatus = type;
  document.getElementById('container')?.setAttribute('data-stage-phase', 'idle');
  const cameraMove = type === 'table' ? setTableDist(distMultiple, duration)
    : type === 'sphere' ? setSphereDist(distMultiple, duration)
    : setLayoutDist(type, duration);
  await Promise.all([cameraMove, moveCards(targets[type], duration)]);
  if (version === layoutVersion) setIdleLayout(type);
}

export { transformTargets as transform, animate, transformStatus };
