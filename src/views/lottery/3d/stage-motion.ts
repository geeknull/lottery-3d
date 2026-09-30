import type { PrizePresentation } from '../core/lottery-types';

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

const acceleration = 1250;
const speed = Math.PI * 2 * 1.25;

// Integrating a smoothstep velocity gives continuous acceleration without the
// abrupt constant-speed jump of a linear orbit tween.
export function spinAt(elapsed: number) {
  const seconds = elapsed / 1000;
  const ramp = acceleration / 1000;
  const u = Math.min(1, seconds / ramp);
  return {
    angle: seconds < ramp ? speed * ramp * (u ** 3 - u ** 4 / 2) : speed * (seconds - ramp / 2),
    velocity: speed * (3 * u ** 2 - 2 * u ** 3),
  };
}

// Milliseconds except brakeScale/staggerScale. The standard preset keeps the
// original timing; ceremonial adds anticipation without changing the result.
const presentationTiming = {
  standard: { brakeScale: 1, earlyStopMs: 650, pauseMs: 220, flightMs: 720, cameraMs: 900, staggerScale: 1 },
  ceremonial: { brakeScale: 1.25, earlyStopMs: 850, pauseMs: 500, flightMs: 1050, cameraMs: 1250, staggerScale: 4 / 3 },
} as const;

export function getPresentationTiming(presentation: PrizePresentation = 'standard') {
  return presentationTiming[presentation];
}
