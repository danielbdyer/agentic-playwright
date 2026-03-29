/**
 * ActIndicator — pure domain module for act badge state machine.
 *
 * The act indicator is a molecule component displaying the current act
 * as a colored badge. It shows:
 *   - Act number and name (e.g., "Act 3: Suite Slicing")
 *   - Color coded by act identity
 *   - Transition animation between acts (slide + cross-fade)
 *   - Iteration counter (e.g., "Iteration 2")
 *   - Progress within act (determinate or indeterminate)
 *
 * The badge cycles through a state machine:
 *   idle → entering → active → exiting → idle (next act)
 *
 * During transitions, both outgoing and incoming badges are visible
 * with opposing opacity animations.
 *
 * Pure domain logic. No React.
 *
 * @see docs/first-day-flywheel-visualization.md Part VI: Act Indicator
 */

import type { FlywheelAct } from './scene-state-accumulator';

// ─── Types ───

/** Badge state machine phases. */
export type BadgePhase = 'idle' | 'entering' | 'active' | 'exiting';

/** Display metadata for one act. */
export interface ActMetadata {
  readonly act: FlywheelAct;
  readonly name: string;
  readonly shortName: string;
  readonly color: string;
  readonly icon: string;         // Unicode icon for compact display
  readonly description: string;  // One-sentence description
}

/** Current badge display state. */
export interface ActBadgeState {
  readonly currentAct: FlywheelAct;
  readonly phase: BadgePhase;
  readonly iteration: number;
  readonly progress: number | null;   // [0,1] or null for indeterminate
  readonly transitionProgress: number; // [0,1] for enter/exit animations
  readonly previousAct: FlywheelAct | null;
}

// ─── Act Metadata ───

export const ACT_METADATA: Readonly<Record<FlywheelAct, ActMetadata>> = {
  1: {
    act: 1,
    name: 'Context Intake',
    shortName: 'Intake',
    color: '#6366f1', // Indigo
    icon: '📋',
    description: 'Ingesting scenarios from Azure DevOps and clustering by affinity.',
  },
  2: {
    act: 2,
    name: 'ARIA Discovery',
    shortName: 'Capture',
    color: '#06b6d4', // Cyan
    icon: '🔍',
    description: 'Navigating routes and capturing ARIA landmarks on each screen.',
  },
  3: {
    act: 3,
    name: 'Suite Slicing',
    shortName: 'Slice',
    color: '#f59e0b', // Amber
    icon: '✂️',
    description: 'Prioritizing scenarios and selecting the execution slice.',
  },
  4: {
    act: 4,
    name: 'Deterministic Compile',
    shortName: 'Compile',
    color: '#10b981', // Emerald
    icon: '⚙️',
    description: 'Binding scenario steps to discovered elements via the resolution ladder.',
  },
  5: {
    act: 5,
    name: 'Execution & Failure',
    shortName: 'Execute',
    color: '#ef4444', // Red
    icon: '▶️',
    description: 'Running compiled scenarios and collecting execution evidence.',
  },
  6: {
    act: 6,
    name: 'Trust-Policy Gating',
    shortName: 'Gate',
    color: '#8b5cf6', // Violet
    icon: '🛡️',
    description: 'Evaluating proposals against trust policy at the glass boundary.',
  },
  7: {
    act: 7,
    name: 'Meta-Measurement',
    shortName: 'Measure',
    color: '#3b82f6', // Blue
    icon: '📊',
    description: 'Computing convergence metrics and deciding iteration continuation.',
  },
} as const;

// ─── State Machine ───

/** Initial badge state. */
export const INITIAL_BADGE_STATE: ActBadgeState = {
  currentAct: 1,
  phase: 'idle',
  iteration: 1,
  progress: null,
  transitionProgress: 0,
  previousAct: null,
};

/**
 * Begin transition to a new act.
 * Sets phase to 'exiting' for current badge.
 */
export function beginActTransition(
  state: ActBadgeState,
  nextAct: FlywheelAct,
): ActBadgeState {
  if (nextAct === state.currentAct) return state;

  return {
    ...state,
    phase: 'exiting',
    previousAct: state.currentAct,
    transitionProgress: 0,
  };
}

/**
 * Advance the transition animation.
 *
 * @param state - Current badge state
 * @param progress - [0, 1] transition progress
 * @param nextAct - The act being transitioned to
 * @returns Updated badge state
 */
export function advanceBadgeTransition(
  state: ActBadgeState,
  progress: number,
  nextAct: FlywheelAct,
): ActBadgeState {
  const clamped = Math.max(0, Math.min(1, progress));

  if (clamped < 0.5) {
    // First half: exiting current
    return {
      ...state,
      phase: 'exiting',
      transitionProgress: clamped * 2, // Remap to [0, 1]
    };
  }

  // Second half: entering next
  return {
    ...state,
    currentAct: nextAct,
    phase: 'entering',
    transitionProgress: (clamped - 0.5) * 2, // Remap to [0, 1]
  };
}

/**
 * Complete the transition — settle into active state.
 */
export function completeBadgeTransition(
  state: ActBadgeState,
  nextAct: FlywheelAct,
  newIteration?: number,
): ActBadgeState {
  return {
    currentAct: nextAct,
    phase: 'active',
    iteration: newIteration ?? state.iteration,
    progress: null,
    transitionProgress: 0,
    previousAct: null,
  };
}

/**
 * Update progress within the current act.
 */
export function updateProgress(
  state: ActBadgeState,
  progress: number | null,
): ActBadgeState {
  return { ...state, progress };
}

/**
 * Advance to a new iteration (Act 7→4 loop).
 */
export function advanceIteration(state: ActBadgeState): ActBadgeState {
  return { ...state, iteration: state.iteration + 1 };
}

// ─── Display Helpers ───

/**
 * Get the display label for the badge.
 * Example: "Act 3: Suite Slicing"
 */
export function badgeLabel(act: FlywheelAct): string {
  const meta = ACT_METADATA[act];
  return `Act ${act}: ${meta.name}`;
}

/**
 * Get the short label for compact display.
 * Example: "3. Slice"
 */
export function shortBadgeLabel(act: FlywheelAct): string {
  const meta = ACT_METADATA[act];
  return `${act}. ${meta.shortName}`;
}

/**
 * Get the opacity for the outgoing badge during transition.
 */
export function outgoingOpacity(state: ActBadgeState): number {
  if (state.phase === 'exiting') {
    return 1 - state.transitionProgress;
  }
  return state.phase === 'active' || state.phase === 'idle' ? 1 : 0;
}

/**
 * Get the opacity for the incoming badge during transition.
 */
export function incomingOpacity(state: ActBadgeState): number {
  if (state.phase === 'entering') {
    return state.transitionProgress;
  }
  return 0;
}

/**
 * Get the iteration display label.
 * Example: "Iteration 2"
 */
export function iterationLabel(iteration: number): string {
  return `Iteration ${iteration}`;
}

/**
 * Get all 7 act metadata entries in order.
 */
export function allActMetadata(): readonly ActMetadata[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((act) => ACT_METADATA[act]);
}
