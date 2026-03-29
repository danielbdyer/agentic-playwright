/**
 * CameraChoreography — pure domain module for 7-act camera movement.
 *
 * Each flywheel act has a designated camera state (position, FOV, target).
 * Transitions between acts use cubic ease-in-out interpolation with
 * act-specific durations. The operator can override the camera via
 * mouse drag (orbit), scroll (zoom), or double-click (focus).
 *
 * Camera States (from spec Part IV):
 *   void     [0,0,6]    FOV 40  — Act 1: pulled back, empty void
 *   harvest  [0,0,4]    FOV 50  — Acts 2,5: standard, screen focus
 *   slice    [-0.5,0,4.5] FOV 55  — Act 3: left-shifted, scenario list
 *   compile  [0,0,4]    FOV 50  — Act 4: centered, screen + observatory
 *   gate     [0.3,0,3.5] FOV 45  — Act 6: right-shifted, glass pane focus
 *   measure  [0,0.3,4.5] FOV 55  — Act 7: pulled back + up, full scene
 *   summary  [0,0,5]    FOV 50  — Final: balanced, complete scene
 *
 * Transition Durations:
 *   1→2: 2.5s, 2→3: 1.5s, 3→4: 2.0s, 4→5: 1.5s,
 *   5→6: 2.0s, 6→7: 2.0s, 7→4: 2.5s (iteration loop)
 *
 * Pure domain logic. No React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part IV: Camera Choreography
 */

import type { FlywheelAct } from './scene-state-accumulator';

// ─── Camera State Types ───

/** Named camera state for each act. */
export type CameraStateName =
  | 'void'     // Act 1
  | 'harvest'  // Acts 2, 5
  | 'slice'    // Act 3
  | 'compile'  // Act 4
  | 'gate'     // Act 6
  | 'measure'  // Act 7
  | 'summary'; // Final (post-convergence)

/** Immutable camera position + orientation + field-of-view. */
export interface CameraState {
  readonly name: CameraStateName;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

/** In-flight transition between two camera states. */
export interface CameraTransition {
  readonly from: CameraState;
  readonly to: CameraState;
  readonly durationMs: number;
  readonly elapsedMs: number;
  readonly progress: number; // [0, 1] eased
}

/** Operator override state — active when user manipulates camera. */
export interface CameraOverride {
  readonly active: boolean;
  readonly position: readonly [number, number, number] | null;
  readonly target: readonly [number, number, number] | null;
  readonly fov: number | null;
  readonly activatedAt: number; // timestamp
}

// ─── Camera State Definitions ───

export const CAMERA_STATES: Readonly<Record<CameraStateName, CameraState>> = {
  void:    { name: 'void',    position: [0, 0, 6],      target: [0, 0, 0],    fov: 40 },
  harvest: { name: 'harvest', position: [0, 0, 4],      target: [-1.8, 0, 0], fov: 50 },
  slice:   { name: 'slice',   position: [-0.5, 0, 4.5], target: [-2, 0, 0],   fov: 55 },
  compile: { name: 'compile', position: [0, 0, 4],      target: [0, 0, 0],    fov: 50 },
  gate:    { name: 'gate',    position: [0.3, 0, 3.5],  target: [-0.1, 0, 0], fov: 45 },
  measure: { name: 'measure', position: [0, 0.3, 4.5],  target: [0, -0.5, 0], fov: 55 },
  summary: { name: 'summary', position: [0, 0, 5],      target: [0, 0, 0],    fov: 50 },
} as const;

// ─── Act → Camera Mapping ───

/** Map each flywheel act to its designated camera state. */
export const ACT_CAMERA_MAP: Readonly<Record<FlywheelAct, CameraStateName>> = {
  1: 'void',
  2: 'harvest',
  3: 'slice',
  4: 'compile',
  5: 'harvest',  // Reuses harvest position for execution
  6: 'gate',
  7: 'measure',
} as const;

// ─── Transition Durations ───

/** Transition duration in ms for each act pair. */
export const TRANSITION_DURATIONS: Readonly<Record<string, number>> = {
  '1→2': 2500,
  '2→3': 1500,
  '3→4': 2000,
  '4→5': 1500,
  '5→6': 2000,
  '6→7': 2000,
  '7→4': 2500,  // Iteration loop back
} as const;

/**
 * Get the transition duration between two acts.
 * Falls back to 2000ms for unlisted transitions.
 */
export function getTransitionDuration(fromAct: FlywheelAct, toAct: FlywheelAct): number {
  const key = `${fromAct}→${toAct}`;
  return TRANSITION_DURATIONS[key] ?? 2000;
}

// ─── Easing Functions ───

/**
 * Cubic ease-in-out: smooth acceleration then deceleration.
 * t ∈ [0, 1] → [0, 1]
 */
export function cubicEaseInOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

// ─── Interpolation ───

/** Linearly interpolate between two 3-tuples. */
export function lerpVec3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/** Linearly interpolate between two scalars. */
export function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute interpolated camera state during a transition.
 *
 * Uses cubic ease-in-out for position, target, and FOV.
 * Returns the current position/target/fov at the given progress.
 */
export function interpolateCamera(transition: CameraTransition): {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
} {
  const t = cubicEaseInOut(transition.progress);
  return {
    position: lerpVec3(transition.from.position, transition.to.position, t),
    target: lerpVec3(transition.from.target, transition.to.target, t),
    fov: lerpScalar(transition.from.fov, transition.to.fov, t),
  };
}

// ─── Transition Management ───

/**
 * Create a new camera transition between two acts.
 */
export function createTransition(
  fromAct: FlywheelAct,
  toAct: FlywheelAct,
  speedMultiplier: number = 1.0,
): CameraTransition {
  const from = CAMERA_STATES[ACT_CAMERA_MAP[fromAct]];
  const to = CAMERA_STATES[ACT_CAMERA_MAP[toAct]];
  const baseDuration = getTransitionDuration(fromAct, toAct);
  const adjustedDuration = Math.round(baseDuration / Math.max(0.1, speedMultiplier));

  return {
    from,
    to,
    durationMs: adjustedDuration,
    elapsedMs: 0,
    progress: 0,
  };
}

/**
 * Advance a transition by deltaMs.
 * Returns updated transition with new elapsed/progress.
 * Progress is clamped to [0, 1].
 */
export function advanceTransition(
  transition: CameraTransition,
  deltaMs: number,
): CameraTransition {
  const newElapsed = transition.elapsedMs + deltaMs;
  const rawProgress = transition.durationMs > 0
    ? newElapsed / transition.durationMs
    : 1;
  const progress = Math.max(0, Math.min(1, rawProgress));

  return {
    ...transition,
    elapsedMs: newElapsed,
    progress,
  };
}

/** Check if a transition has completed. */
export function isTransitionComplete(transition: CameraTransition): boolean {
  return transition.progress >= 1;
}

// ─── Operator Override ───

/** Initial override state — no override active. */
export const INITIAL_OVERRIDE: CameraOverride = {
  active: false,
  position: null,
  target: null,
  fov: null,
  activatedAt: 0,
};

/**
 * Activate camera override with operator-provided values.
 */
export function activateOverride(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
  fov: number,
  now: number,
): CameraOverride {
  return {
    active: true,
    position,
    target,
    fov,
    activatedAt: now,
  };
}

/** Deactivate override — returns to choreographed camera. */
export function deactivateOverride(): CameraOverride {
  return INITIAL_OVERRIDE;
}

/**
 * Resolve the effective camera values given current state.
 * Override takes precedence if active; otherwise uses transition/static.
 */
export function resolveCamera(
  currentAct: FlywheelAct,
  transition: CameraTransition | null,
  override: CameraOverride,
): {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
} {
  // Override takes precedence
  if (override.active && override.position && override.target && override.fov) {
    return {
      position: override.position,
      target: override.target,
      fov: override.fov,
    };
  }

  // Active transition
  if (transition && !isTransitionComplete(transition)) {
    return interpolateCamera(transition);
  }

  // Static position for current act
  const state = CAMERA_STATES[ACT_CAMERA_MAP[currentAct]];
  return {
    position: state.position,
    target: state.target,
    fov: state.fov,
  };
}

/**
 * Get camera state name for an act.
 */
export function cameraStateForAct(act: FlywheelAct): CameraStateName {
  return ACT_CAMERA_MAP[act];
}
