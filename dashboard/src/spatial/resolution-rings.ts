/**
 * ResolutionRings — concentric probe rings showing resolution ladder attempts.
 *
 * During Act 5 (Execution & Failure), the resolution ladder becomes visible
 * at each element position. Each ring represents one rung attempt:
 *   - Color per rung (ARIA → green, testId → cyan, text → amber, CSS → red)
 *   - Radius increases with each attempt
 *   - On success: rings collapse to focused glow + particle arc to observatory
 *   - On failure: rings flash red and scatter as fragments
 *
 * This module contains the pure domain logic for computing ring geometries
 * and visual states. The R3F rendering component reads this state.
 *
 * Architecture:
 *   step-executing → addRingAttempt()
 *   step-resolved (success) → collapseToSuccess()
 *   step-resolved (failure) → shatterToFailure()
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 5), Part VIII
 */

// ─── Rung Types ───

/** Resolution rung names from the locator ladder. */
export type ResolutionRung =
  | 'getByRole'
  | 'getByLabel'
  | 'getByPlaceholder'
  | 'getByText'
  | 'getByTestId'
  | 'css'
  | 'xpath'
  | 'needs-human';

/** Color mapping per rung — higher rungs are greener, lower are redder. */
export const RUNG_COLORS: Readonly<Record<ResolutionRung, string>> = {
  'getByRole':        '#22c55e', // Green — best ARIA rung
  'getByLabel':       '#34d399', // Emerald
  'getByPlaceholder': '#6ee7b7', // Light emerald
  'getByText':        '#fbbf24', // Amber
  'getByTestId':      '#06b6d4', // Cyan
  'css':              '#f97316', // Orange
  'xpath':            '#ef4444', // Red — worst programmatic rung
  'needs-human':      '#a855f7', // Purple — human escalation
} as const;

/** Rung quality score [0, 1] — used for ring intensity. */
export const RUNG_QUALITY: Readonly<Record<ResolutionRung, number>> = {
  'getByRole':        1.0,
  'getByLabel':       0.9,
  'getByPlaceholder': 0.8,
  'getByText':        0.6,
  'getByTestId':      0.5,
  'css':              0.3,
  'xpath':            0.2,
  'needs-human':      0.0,
} as const;

// ─── Ring Types ───

/** A single ring in the resolution ladder visualization. */
export interface ProbeRing {
  readonly rung: ResolutionRung;
  readonly color: string;
  readonly quality: number;
  readonly radius: number;     // World units
  readonly opacity: number;    // [0, 1]
  readonly attemptIndex: number; // 0-based
}

/** Outcome of a resolution attempt for an element. */
export type ResolutionOutcome =
  | 'pending'    // Still attempting
  | 'resolved'   // Found at a specific rung
  | 'failed'     // All rungs exhausted
  | 'escalated'; // Handed to human

/** State of all rings for a single element. */
export interface ElementRingState {
  readonly elementId: string;
  readonly screen: string;
  readonly position: readonly [number, number, number]; // World position
  readonly rings: readonly ProbeRing[];
  readonly outcome: ResolutionOutcome;
  readonly resolvedRung: ResolutionRung | null;
  readonly animationProgress: number; // [0, 1] for collapse/shatter
}

/** Full ring manager state. */
export interface ResolutionRingState {
  readonly elements: ReadonlyMap<string, ElementRingState>;
  readonly totalAttempts: number;
  readonly totalResolved: number;
  readonly totalFailed: number;
}

// ─── Constants ───

const BASE_RING_RADIUS = 0.02;
const RING_RADIUS_INCREMENT = 0.015;
const MAX_RINGS_PER_ELEMENT = 8;

// ─── Initial State ───

export const INITIAL_RING_STATE: ResolutionRingState = {
  elements: new Map(),
  totalAttempts: 0,
  totalResolved: 0,
  totalFailed: 0,
};

// ─── Pure State Transitions ───

/**
 * Add a rung attempt ring to an element.
 *
 * Called when a step-executing event fires with a specific rung.
 * Each attempt adds a concentric ring with the rung's color and radius.
 *
 * @param state Current ring state
 * @param elementId Element being resolved
 * @param screen Screen the element is on
 * @param rung Resolution rung being attempted
 * @param position World position for the ring center
 * @returns Updated state with new ring added
 */
export function addRingAttempt(
  state: ResolutionRingState,
  elementId: string,
  screen: string,
  rung: ResolutionRung,
  position: readonly [number, number, number],
): ResolutionRingState {
  const existing = state.elements.get(elementId);

  const attemptIndex = existing ? existing.rings.length : 0;
  if (attemptIndex >= MAX_RINGS_PER_ELEMENT) return state;

  const newRing: ProbeRing = {
    rung,
    color: RUNG_COLORS[rung],
    quality: RUNG_QUALITY[rung],
    radius: BASE_RING_RADIUS + attemptIndex * RING_RADIUS_INCREMENT,
    opacity: 0.6 + RUNG_QUALITY[rung] * 0.4,
    attemptIndex,
  };

  const updatedElement: ElementRingState = existing
    ? { ...existing, rings: [...existing.rings, newRing] }
    : {
        elementId,
        screen,
        position,
        rings: [newRing],
        outcome: 'pending',
        resolvedRung: null,
        animationProgress: 0,
      };

  const newElements = new Map(state.elements);
  newElements.set(elementId, updatedElement);

  return {
    ...state,
    elements: newElements,
    totalAttempts: state.totalAttempts + 1,
  };
}

/**
 * Collapse rings to a focused glow on successful resolution.
 *
 * All rings converge toward the center. The resolved rung's color
 * becomes the dominant glow. Triggers particle arc to observatory.
 *
 * @param state Current ring state
 * @param elementId Element that was resolved
 * @param resolvedRung The rung that succeeded
 * @param progress Animation progress [0, 1] — 0=rings visible, 1=collapsed to glow
 * @returns Updated state with collapsed rings
 */
export function collapseToSuccess(
  state: ResolutionRingState,
  elementId: string,
  resolvedRung: ResolutionRung,
  progress: number,
): ResolutionRingState {
  const existing = state.elements.get(elementId);
  if (!existing) return state;

  const clampedProgress = Math.max(0, Math.min(1, progress));

  const collapsedRings: readonly ProbeRing[] = existing.rings.map((ring) => ({
    ...ring,
    radius: ring.radius * (1 - clampedProgress * 0.8), // Collapse toward center
    opacity: ring.rung === resolvedRung
      ? Math.min(1, ring.opacity + clampedProgress * 0.4) // Winning rung brightens
      : ring.opacity * (1 - clampedProgress), // Others fade
  }));

  const updatedElement: ElementRingState = {
    ...existing,
    rings: collapsedRings,
    outcome: 'resolved',
    resolvedRung,
    animationProgress: clampedProgress,
  };

  const newElements = new Map(state.elements);
  newElements.set(elementId, updatedElement);

  return {
    ...state,
    elements: newElements,
    totalResolved: existing.outcome !== 'resolved'
      ? state.totalResolved + 1
      : state.totalResolved,
  };
}

/**
 * Shatter rings into fragments on failure.
 *
 * Rings expand rapidly, flash red, and break apart.
 * Fragments drift toward the glass pane for proposal generation.
 *
 * @param state Current ring state
 * @param elementId Element that failed resolution
 * @param progress Animation progress [0, 1] — 0=rings intact, 1=fully scattered
 * @returns Updated state with shattered rings
 */
export function shatterToFailure(
  state: ResolutionRingState,
  elementId: string,
  progress: number,
): ResolutionRingState {
  const existing = state.elements.get(elementId);
  if (!existing) return state;

  const clampedProgress = Math.max(0, Math.min(1, progress));

  const shatteredRings: readonly ProbeRing[] = existing.rings.map((ring) => ({
    ...ring,
    radius: ring.radius * (1 + clampedProgress * 3), // Expand rapidly
    opacity: Math.max(0, ring.opacity * (1 - clampedProgress)),
    color: lerpColor(ring.color, '#ef4444', clampedProgress), // Flash red
  }));

  const updatedElement: ElementRingState = {
    ...existing,
    rings: shatteredRings,
    outcome: 'failed',
    resolvedRung: null,
    animationProgress: clampedProgress,
  };

  const newElements = new Map(state.elements);
  newElements.set(elementId, updatedElement);

  return {
    ...state,
    elements: newElements,
    totalFailed: existing.outcome !== 'failed'
      ? state.totalFailed + 1
      : state.totalFailed,
  };
}

/**
 * Remove completed ring animations (fully collapsed or shattered).
 * Call periodically to keep the element map lean.
 */
export function pruneCompleted(state: ResolutionRingState): ResolutionRingState {
  const newElements = new Map<string, ElementRingState>();
  for (const [id, element] of state.elements) {
    if (element.animationProgress < 1 || element.outcome === 'pending') {
      newElements.set(id, element);
    }
  }
  return { ...state, elements: newElements };
}

// ─── Color Interpolation ───

/** Linear color interpolation between two hex colors. Pure. */
export function lerpColor(from: string, to: string, t: number): string {
  const fromRgb = hexToRgb(from);
  const toRgb = hexToRgb(to);
  const ct = Math.max(0, Math.min(1, t));
  const r = Math.round(fromRgb[0] + (toRgb[0] - fromRgb[0]) * ct);
  const g = Math.round(fromRgb[1] + (toRgb[1] - fromRgb[1]) * ct);
  const b = Math.round(fromRgb[2] + (toRgb[2] - fromRgb[2]) * ct);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
