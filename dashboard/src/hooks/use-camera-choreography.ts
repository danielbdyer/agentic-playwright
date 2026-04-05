/**
 * useCameraChoreography — automated camera state machine for flywheel visualization.
 *
 * Drives smooth transitions between seven named camera states (one per flywheel act).
 * Each transition interpolates position, fov, and target using cubic ease-in-out.
 *
 * Supports operator override: manual camera control pauses automation, and
 * releaseOverride smoothly returns to the current act's camera state.
 *
 * Animation state lives in refs to avoid re-renders on every frame.
 * Exposed state is updated via setState at display-refresh cadence.
 *
 * Complexity:
 *   interpolate:  O(1) — three lerps + easing
 *   frame update:  O(1) — single rAF callback
 */

import { useState, useRef, useEffect } from 'react';
import type { FlywheelAct } from '../types';

// ─── Camera State Domain ───

export interface CameraState {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly fov: number;
  readonly target: readonly [number, number, number];
}

export const CAMERA_STATES: Readonly<Record<FlywheelAct, CameraState>> = {
  1: { name: 'void',    position: [0, 0, 6],      fov: 40, target: [0, 0, 0] },
  2: { name: 'harvest', position: [0, 0, 4],      fov: 50, target: [-1.8, 0, 0] },
  3: { name: 'slice',   position: [-0.5, 0, 4.5], fov: 55, target: [-2, 0, 0] },
  4: { name: 'compile', position: [0, 0, 4],      fov: 50, target: [0, 0, 0] },
  5: { name: 'harvest', position: [0, 0, 4],      fov: 50, target: [-1.8, 0, 0] },
  6: { name: 'gate',    position: [0.3, 0, 3.5],  fov: 45, target: [-0.1, 0, 0] },
  7: { name: 'measure', position: [0, 0.3, 4.5],  fov: 55, target: [0, -0.5, 0] },
} as const;

export const TRANSITION_DURATIONS: Readonly<Record<string, number>> = {
  '1->2': 2500,
  '2->3': 1500,
  '3->4': 2000,
  '4->5': 1500,
  '5->6': 2000,
  '6->7': 2000,
  '7->4': 2500,
} as const;

// ─── Easing ───

/** Cubic ease-in-out — smooth acceleration and deceleration. */
const cubicEaseInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ─── Interpolation ───

type Vec3 = readonly [number, number, number];

const lerpScalar = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerpScalar(a[0], b[0], t),
  lerpScalar(a[1], b[1], t),
  lerpScalar(a[2], b[2], t),
];

const interpolateCameraState = (
  from: CameraState,
  to: CameraState,
  rawT: number,
): { readonly position: Vec3; readonly fov: number; readonly target: Vec3 } => {
  const t = cubicEaseInOut(Math.max(0, Math.min(1, rawT)));
  return {
    position: lerpVec3(from.position, to.position, t),
    fov: lerpScalar(from.fov, to.fov, t),
    target: lerpVec3(from.target, to.target, t),
  };
};

// ─── Transition Key ───

const transitionKey = (from: FlywheelAct, to: FlywheelAct): string => `${from}->${to}`;

const DEFAULT_DURATION = 2000;

const getTransitionDuration = (from: FlywheelAct, to: FlywheelAct, speedMultiplier: number): number => {
  const base = TRANSITION_DURATIONS[transitionKey(from, to)] ?? DEFAULT_DURATION;
  return base / speedMultiplier;
};

// ─── Hook Interface ───

export interface CameraChoreographyState {
  /** Current interpolated camera position. */
  readonly position: Vec3;
  /** Current interpolated field of view. */
  readonly fov: number;
  /** Current interpolated look-at target. */
  readonly target: Vec3;
  /** Whether operator has overridden the automated camera. */
  readonly overrideActive: boolean;
  /** Current act the camera is targeting. */
  readonly currentAct: FlywheelAct;
  /** Whether a transition is in progress. */
  readonly transitioning: boolean;
  /** Transition progress [0, 1] when transitioning. */
  readonly transitionProgress: number;
  /** Release operator override and return to automated choreography. */
  readonly releaseOverride: () => void;
  /** Manually override camera position (e.g., from user drag). */
  readonly setOverride: (position: Vec3, fov: number, target: Vec3) => void;
  /** Jump camera to a specific act state immediately (e.g., pressing 1-7). */
  readonly jumpToAct: (act: FlywheelAct) => void;
}

export interface CameraChoreographyOptions {
  readonly enabled?: boolean;
  readonly speedMultiplier?: number;
}

// ─── Internal Animation State ───

interface TransitionState {
  readonly from: CameraState;
  readonly to: CameraState;
  readonly duration: number;
  readonly startTime: number;
}

interface OverrideState {
  readonly position: Vec3;
  readonly fov: number;
  readonly target: Vec3;
}

// ─── Default / Disabled State ───

const DISABLED_STATE: CameraChoreographyState = {
  position: CAMERA_STATES[1].position,
  fov: CAMERA_STATES[1].fov,
  target: CAMERA_STATES[1].target,
  overrideActive: false,
  currentAct: 1,
  transitioning: false,
  transitionProgress: 0,
  releaseOverride: () => {},
  setOverride: () => {},
  jumpToAct: () => {},
};

// ─── Hook ───

export function useCameraChoreography(
  currentAct: FlywheelAct,
  options?: CameraChoreographyOptions,
): CameraChoreographyState {
  const enabled = options?.enabled ?? true;
  const speedMultiplier = options?.speedMultiplier ?? 1;

  const initialState = CAMERA_STATES[currentAct];
  const [exposed, setExposed] = useState<CameraChoreographyState>({
    position: initialState.position,
    fov: initialState.fov,
    target: initialState.target,
    overrideActive: false,
    currentAct,
    transitioning: false,
    transitionProgress: 0,
    releaseOverride: () => {},
    setOverride: () => {},
    jumpToAct: () => {},
  });

  // Mutable animation refs — never trigger re-renders directly.
  const transitionRef = useRef<TransitionState | null>(null);
  const overrideRef = useRef<OverrideState | null>(null);
  const prevActRef = useRef<FlywheelAct>(currentAct);
  const rafRef = useRef<number>(0);
  const settledActRef = useRef<FlywheelAct>(currentAct);

  // ─── Operator Override ───

  const setOverride = (position: Vec3, fov: number, target: Vec3) => {
    overrideRef.current = { position, fov, target };
    transitionRef.current = null;
  };

  const releaseOverride = () => {
    const prev = overrideRef.current;
    if (!prev) return;

    const targetState = CAMERA_STATES[settledActRef.current];
    const fromState: CameraState = {
      name: 'override',
      position: prev.position,
      fov: prev.fov,
      target: prev.target,
    };

    overrideRef.current = null;
    transitionRef.current = {
      from: fromState,
      to: targetState,
      duration: DEFAULT_DURATION / speedMultiplier,
      startTime: performance.now(),
    };
  };

  const jumpToAct = (act: FlywheelAct) => {
    const target = CAMERA_STATES[act];
    overrideRef.current = null;
    transitionRef.current = null;
    settledActRef.current = act;
    prevActRef.current = act;

    setExposed((prev) => ({
      ...prev,
      position: target.position,
      fov: target.fov,
      target: target.target,
      overrideActive: false,
      currentAct: act,
      transitioning: false,
      transitionProgress: 0,
    }));
  };

  // ─── Act Change Detection ───

  useEffect(() => {
    if (!enabled) return;
    if (currentAct === prevActRef.current) return;
    if (overrideRef.current) {
      // During override, track the target act but don't start a transition.
      prevActRef.current = currentAct;
      settledActRef.current = currentAct;
      return;
    }

    const fromAct = prevActRef.current;
    const fromState = CAMERA_STATES[fromAct];
    const toState = CAMERA_STATES[currentAct];

    // If already mid-transition, start from current interpolated position.
    const activeTransition = transitionRef.current;
    const effectiveFrom: CameraState = activeTransition
      ? (() => {
          const elapsed = performance.now() - activeTransition.startTime;
          const rawT = Math.min(1, elapsed / activeTransition.duration);
          const snapshot = interpolateCameraState(activeTransition.from, activeTransition.to, rawT);
          return { name: 'mid-transition', ...snapshot };
        })()
      : fromState;

    transitionRef.current = {
      from: effectiveFrom,
      to: toState,
      duration: getTransitionDuration(fromAct, currentAct, speedMultiplier),
      startTime: performance.now(),
    };

    prevActRef.current = currentAct;
    settledActRef.current = currentAct;
  }, [currentAct, enabled, speedMultiplier]);

  // ─── Animation Loop ───

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const override = overrideRef.current;
      const transition = transitionRef.current;

      if (override) {
        setExposed((prev) => {
          // Skip update if nothing changed.
          if (
            prev.overrideActive &&
            prev.position === override.position &&
            prev.fov === override.fov &&
            prev.target === override.target
          ) return prev;

          return {
            ...prev,
            position: override.position,
            fov: override.fov,
            target: override.target,
            overrideActive: true,
            transitioning: false,
            transitionProgress: 0,
          };
        });
      } else if (transition) {
        const elapsed = performance.now() - transition.startTime;
        const rawT = Math.min(1, elapsed / transition.duration);
        const interpolated = interpolateCameraState(transition.from, transition.to, rawT);
        const done = rawT >= 1;

        if (done) {
          transitionRef.current = null;
        }

        setExposed((prev) => ({
          ...prev,
          position: interpolated.position,
          fov: interpolated.fov,
          target: interpolated.target,
          overrideActive: false,
          currentAct: settledActRef.current,
          transitioning: !done,
          transitionProgress: done ? 0 : rawT,
        }));
      } else {
        // Settled — ensure state reflects current act (idempotent).
        const settled = CAMERA_STATES[settledActRef.current];
        setExposed((prev) => {
          if (
            !prev.overrideActive &&
            !prev.transitioning &&
            prev.currentAct === settledActRef.current &&
            prev.position === settled.position
          ) return prev;

          return {
            ...prev,
            position: settled.position,
            fov: settled.fov,
            target: settled.target,
            overrideActive: false,
            currentAct: settledActRef.current,
            transitioning: false,
            transitionProgress: 0,
          };
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled]);

  // ─── Attach Stable Callbacks ───

  // Re-derive exposed state with stable callbacks to avoid stale closures.
  const stableState: CameraChoreographyState = enabled
    ? {
        position: exposed.position,
        fov: exposed.fov,
        target: exposed.target,
        overrideActive: exposed.overrideActive,
        currentAct: exposed.currentAct,
        transitioning: exposed.transitioning,
        transitionProgress: exposed.transitionProgress,
        releaseOverride,
        setOverride,
        jumpToAct,
      }
    : DISABLED_STATE;

  return stableState;
}
