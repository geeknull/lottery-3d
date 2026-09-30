import { Tween, Easing } from '@tweenjs/tween.js';
import { cardSize, objects, targets, scene, camera, controls, render, getContainerWidth, getContainerHeight } from './3d-core';
import { Vector3 } from 'three';
import { getFitWidthZ, getFitHeightZ, setCardDist, setSphereDist } from './3d-calc-distance';
import { tweenGroup } from './tween-group';
import { cancelCameraView, rememberCameraView, resetCameraView, setCameraView } from './3d-camera-view';
import { getWinnerLayout } from './3d-winner-layout';
import { getPresentationTiming, prefersReducedMotion, spinAt } from './stage-motion';
import { pauseIdleOrbit } from './idle-orbit';
import type { PrizePresentation } from '../core/lottery-types';

export const WINNER_GROUP_SIZE = 6;
interface Operation { cancelled: boolean; stops: Set<() => void> }
interface WinnerComposition { indices: number[]; plane: number | null; revealDistance: number }
let activeOperation: Operation | null = null;
let composition: WinnerComposition | null = null;
let spinTween: Tween<{ elapsed: number }> | null = null;
let orbit = { angle: 0, velocity: 0, radius: 3000, height: 0 };

function setStagePhase(phase: string) {
  document.getElementById('container')?.setAttribute('data-stage-phase', phase);
}

function cancelOperation() {
  if (!activeOperation) return;
  activeOperation.cancelled = true;
  for (const stop of activeOperation.stops) stop();
  activeOperation.stops.clear();
  activeOperation = null;
  cancelCameraView();
}

function beginOperation() {
  cancelOperation();
  const operation: Operation = { cancelled: false, stops: new Set() };
  activeOperation = operation;
  return operation;
}

function motion(operation: Operation, duration: number, update: (progress: number) => void, delay = 0) {
  if (operation.cancelled) return Promise.resolve();
  if (duration === 0) { update(1); render(); return Promise.resolve(); }
  return new Promise<void>(resolve => {
    const finish = () => {
      tweenGroup.remove(tween);
      operation.stops.delete(stop);
      resolve();
    };
    const tween = new Tween({ progress: 0 }, tweenGroup)
      .to({ progress: 1 }, duration)
      .delay(delay)
      .onUpdate(({ progress }) => { update(progress); render(); })
      .onComplete(finish)
      .onStop(finish);
    const stop = () => tween.stop();
    operation.stops.add(stop);
    tween.start();
  });
}

function getWinnerComposition(count: number) {
  const width = getContainerWidth();
  const height = getContainerHeight();
  // Reserve the award title above and the camera controls below the cards.
  const availableWidth = Math.max(1, width - Math.min(64, width / 4));
  const availableHeight = Math.max(1, height - Math.min(170, height / 3));
  const layout = getWinnerLayout(count, availableWidth / availableHeight, cardSize);
  const distance = Math.max(
    getFitWidthZ(layout.width) * width / availableWidth,
    getFitHeightZ(layout.height) * height / availableHeight,
  );
  return { ...layout, distance };
}

function validIndices(indices: number[]) {
  return [...new Set(indices)].filter(index => Number.isInteger(index) && objects[index]);
}

function ensureComposition(indices: number[], replace = false) {
  const valid = validIndices(indices);
  if (replace || !composition || composition.indices.join(',') !== valid.join(',')) {
    composition = { indices: valid, plane: null, revealDistance: camera.position.z };
  }
  return composition;
}

function markWinners(indices: number[], visibleIndices = indices) {
  const winnerSet = new Set(indices);
  const visibleSet = new Set(visibleIndices);
  objects.forEach((object, index) => {
    object.visible = !winnerSet.has(index) || visibleSet.has(index);
    object.element.classList.toggle('winner-background', !winnerSet.has(index));
    object.element.classList.toggle('winner-current', winnerSet.has(index));
    if (winnerSet.has(index)) object.element.classList.add('prize');
  });
}

async function flyWinners(state: WinnerComposition, operation: Operation, duration: number, groupIndices = state.indices, closeup = false, timing = getPresentationTiming()) {
  if (groupIndices.length === 0 || operation.cancelled) return;
  const selected = groupIndices.map(index => objects[index]);
  markWinners(state.indices, groupIndices);
  const layout = getWinnerComposition(selected.length);
  if (state.plane === null) {
    const winnerSet = new Set(state.indices);
    const frontZ = objects.reduce((z, object, index) => winnerSet.has(index) ? z : Math.max(z, object.position.z), 0)
      + Math.hypot(cardSize.width, cardSize.height) / 2 + 30;
    state.plane = Math.max(frontZ, setCardDist(layout.width, layout.height));
    state.revealDistance = camera.position.z;
  }
  const plane = state.plane;
  const winnerView = (distance: number) => ({
    target: new Vector3(0, 0, plane),
    distance: closeup ? distance : Math.max(state.revealDistance - plane, distance),
  });
  const rows = [...new Set(layout.positions.map(position => position.y))];
  const cameraMove = setCameraView(() => winnerView(layout.distance), duration === 0 ? 0 : timing.cameraMs)
    .then(() => { if (!operation.cancelled) controls.enabled = false; });
  controls.enabled = false;
  const columns = new Map<number, number>();
  const flights = selected.map((object, index) => {
    const startPosition = object.position.clone();
    const startRotation = object.quaternion.clone();
    const destination = new Vector3(layout.positions[index].x, layout.positions[index].y, plane);
    const rotation = object.quaternion.clone().identity();
    const row = rows.indexOf(layout.positions[index].y);
    const column = columns.get(layout.positions[index].y) ?? 0;
    columns.set(layout.positions[index].y, column + 1);
    const delay = duration === 0 ? 0 : Math.min(360, row * 85 + column * 28) * timing.staggerScale;
    return motion(operation, duration, progress => {
      const eased = Easing.Cubic.InOut(progress);
      object.position.lerpVectors(startPosition, destination, eased);
      object.quaternion.slerpQuaternions(startRotation, rotation, eased);
    }, delay);
  });
  await Promise.all([cameraMove, ...flights]);
  if (operation.cancelled) return;
  rememberCameraView(() => {
    const current = getWinnerComposition(selected.length);
    selected.forEach((object, index) => {
      object.position.set(current.positions[index].x, current.positions[index].y, plane);
      object.rotation.set(0, 0, 0);
    });
    return winnerView(current.distance);
  });
  await resetCameraView(0);
  if (!operation.cancelled) setStagePhase('presenting');
}

function stopSpin() {
  spinTween?.stop();
  if (spinTween) tweenGroup.remove(spinTween);
  spinTween = null;
}

function orbitAt(angle: number) {
  camera.position.set(orbit.radius * Math.sin(angle), orbit.height, orbit.radius * Math.cos(angle));
  camera.lookAt(scene.position);
  render();
}

export function prepareSpin(): Promise<void> {
  pauseIdleOrbit();
  // A prepared sphere is already on axis, so the common start path adds no wait.
  const aligned = Math.abs(camera.position.x - controls.target.x) < 0.01
    && Math.abs(camera.position.y - controls.target.y) < 0.01
    && camera.position.z > controls.target.z
    && Math.abs(camera.quaternion.w) > 0.999999;
  return resetCameraView(aligned ? 0 : 650);
}

// Orbit the camera rather than every card. CSS3DRenderer can then reuse the N
// card matrices and change only its single camera container transform.
function rotateBall() {
  cancelOperation();
  stopSpin();
  void resetCameraView(0);
  composition = null;
  setStagePhase('spinning');
  controls.enabled = false;
  if (prefersReducedMotion()) return;
  orbit = { angle: 0, velocity: 0, radius: Math.hypot(camera.position.x, camera.position.z), height: camera.position.y };
  spinTween = new Tween({ elapsed: 0 }, tweenGroup)
    .to({ elapsed: 1e12 }, 1e12)
    .onUpdate(({ elapsed }) => {
      const motion = spinAt(elapsed);
      orbit.angle = motion.angle;
      orbit.velocity = motion.velocity;
      orbitAt(orbit.angle);
    })
    .start();
}

// Public compatibility operation: immediate stop/reset. The full reveal owns
// its smooth braking through revealWinners so skip can cancel the whole chain.
function rotateBallStop() {
  stopSpin();
  return resetCameraView(0);
}

async function brake(operation: Operation, timing: ReturnType<typeof getPresentationTiming>) {
  const wasSpinning = spinTween !== null;
  stopSpin();
  setStagePhase('settling');
  if (!wasSpinning || prefersReducedMotion()) { await resetCameraView(0); return; }
  controls.enabled = false;
  // Very early stops are still close to the front; a short camera settle avoids
  // speeding up just to force another full turn before the reveal.
  if (orbit.velocity < 4) {
    await resetCameraView(timing.earlyStopMs);
    return;
  }
  const startAngle = orbit.angle;
  const turn = Math.PI * 2;
  const destination = Math.ceil((startAngle + orbit.velocity * 0.35) / turn) * turn;
  const delta = destination - startAngle;
  const duration = 2000 * delta / orbit.velocity * timing.brakeScale;
  const tangent = orbit.velocity * duration / 1000;
  // Hermite keeps the incoming angular speed and ends at zero. Both presets
  // decelerate monotonically; standard simplifies to the original quadratic.
  await motion(operation, duration, u => {
    orbitAt(startAngle + (-2 * u ** 3 + 3 * u ** 2) * delta + (u ** 3 - 2 * u ** 2 + u) * tangent);
  });
  if (!operation.cancelled) await resetCameraView(0);
}

export async function revealWinners(indices: number[], options: { signal?: AbortSignal; replay?: boolean; presentation?: PrizePresentation } = {}) {
  if (options.signal?.aborted) return;
  const operation = beginOperation();
  const timing = getPresentationTiming(options.presentation);
  const state = ensureComposition(indices, true);
  if (state.indices.length === 0) { activeOperation = null; return; }
  const abort = () => { if (activeOperation === operation) cancelOperation(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    if (options.replay) {
      stopSpin();
      // Replay can start from a table or showcase layout, so restore the whole
      // source composition while retaining the supplied, already drawn winners.
      objects.forEach((object, index) => {
        const target = targets.sphere[index];
        if (target) {
          object.position.copy(target.position);
          object.quaternion.copy(target.quaternion);
        }
        object.visible = true;
      });
      await setSphereDist(1.05, 0);
    } else {
      await brake(operation, timing);
    }
    if (operation.cancelled) return;
    controls.enabled = false;
    setStagePhase('anticipation');
    await motion(operation, prefersReducedMotion() ? 0 : timing.pauseMs, () => {});
    if (operation.cancelled) return;
    setStagePhase('revealing');
    await flyWinners(state, operation, prefersReducedMotion() ? 0 : timing.flightMs, state.indices, false, timing);
  } finally {
    options.signal?.removeEventListener('abort', abort);
    if (activeOperation === operation) activeOperation = null;
  }
}

export async function finishReveal(indices: number[]) {
  const operation = beginOperation();
  stopSpin();
  // If skipped during the orbit, establish the front view before choosing depth.
  if (!composition?.plane) await resetCameraView(0);
  const state = ensureComposition(indices);
  await flyWinners(state, operation, 0);
  if (activeOperation === operation) activeOperation = null;
}

async function cardFlyAnimation(indices: number[]) {
  if (indices.length === 0) return;
  const operation = beginOperation();
  const state = ensureComposition(indices, true);
  await flyWinners(state, operation, prefersReducedMotion() ? 0 : 720);
  if (activeOperation === operation) activeOperation = null;
}

export async function showWinnerGroup(page: number | null) {
  if (!composition || composition.indices.length === 0) return;
  const operation = beginOperation();
  const groupCount = Math.ceil(composition.indices.length / WINNER_GROUP_SIZE);
  const index = page === null ? null : Math.min(groupCount - 1, Math.max(0, Math.floor(page)));
  // Balance the groups so 13 winners become 5 + 4 + 4, not 6 + 6 + 1.
  const groupSize = Math.floor(composition.indices.length / groupCount);
  const extra = composition.indices.length % groupCount;
  const start = index === null ? 0 : index * groupSize + Math.min(index, extra);
  const size = index === null ? composition.indices.length : groupSize + (index < extra ? 1 : 0);
  const indices = composition.indices.slice(start, start + size);
  await flyWinners(composition, operation, prefersReducedMotion() ? 0 : 400, indices, index !== null);
  if (activeOperation === operation) activeOperation = null;
}

export function disposeActions() {
  cancelOperation();
  stopSpin();
  composition = null;
}

export { rotateBall, rotateBallStop, cardFlyAnimation };
