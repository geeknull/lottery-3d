import { Vector3 } from 'three';
import { camera, controls, render } from './3d-core';
import { prefersReducedMotion } from './stage-motion';

let surface: HTMLElement | null = null;
let motionQuery: MediaQueryList | null = null;
let sphere = false;
let allowed = false;
let interrupted = false;
let previousTime: number | null = null;
const offset = new Vector3();
const axis = new Vector3(0, 1, 0);

export function pauseIdleOrbit() {
  interrupted = true;
  previousTime = null;
}

export function setIdleAllowed(value: boolean) {
  allowed = value;
  previousTime = null;
}

// Only completing a new sphere layout re-arms motion after a manual gesture or
// explicit reset. Returning to idle after reset must leave the camera stable.
export function setIdleLayout(type: string | null) {
  sphere = type === 'sphere';
  interrupted = false;
  previousTime = null;
}

export function updateIdleOrbit(time: number) {
  if (!sphere || !allowed || interrupted || !controls.enabled
    || (motionQuery?.matches ?? prefersReducedMotion())) {
    previousTime = null;
    return;
  }
  if (previousTime !== null) {
    // One turn per three minutes; cap elapsed time after background-tab pauses.
    const elapsed = Math.min(100, Math.max(0, time - previousTime));
    offset.copy(camera.position).sub(controls.target).applyAxisAngle(axis, elapsed / 180000 * Math.PI * 2);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    render();
  }
  previousTime = time;
}

export function initIdleOrbit(container: HTMLElement) {
  disposeIdleOrbit();
  surface = container;
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  // Capture pauses before TrackballControls handles the same gesture.
  surface.addEventListener('pointerdown', pauseIdleOrbit, true);
  surface.addEventListener('wheel', pauseIdleOrbit, { capture: true, passive: true });
}

export function disposeIdleOrbit() {
  surface?.removeEventListener('pointerdown', pauseIdleOrbit, true);
  surface?.removeEventListener('wheel', pauseIdleOrbit, true);
  surface = null;
  motionQuery = null;
  sphere = false;
  allowed = false;
  interrupted = false;
  previousTime = null;
}
