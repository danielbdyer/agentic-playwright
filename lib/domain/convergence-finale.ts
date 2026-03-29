/**
 * Convergence Finale State Machine — pure FSM for the most emotionally
 * important moment in the flywheel visualization.
 *
 * Convergence is detected when the `convergence-evaluated` event arrives
 * with `converged: true`. The convergence reason determines the visual
 * character: triumph (threshold-met), grace (no-proposals), or honest
 * stopping (budget-exhausted / max-iterations).
 *
 * Each convergence scenario defines a timed sequence of visual phases:
 *   - Observatory crystallization
 *   - Glass pane dissolution/thinning
 *   - Radial color wave (green/amber/none)
 *   - Ambient crescendo
 *   - Narration milestone
 *   - Summary view transition
 *
 * The FSM is pure: `advance(state, elapsedMs)` returns the next state.
 * No React, no Three.js, no side effects. The rendering layer reads
 * the state and applies the visual treatment.
 *
 * @see docs/first-day-flywheel-visualization.md Part IX
 */

// ─── Convergence Reason ───

export type ConvergenceReason =
  | 'threshold-met'
  | 'no-proposals'
  | 'budget-exhausted'
  | 'max-iterations';

// ─── Finale Phase ───

export type FinalePhase =
  | 'idle'                   // Not yet converged
  | 'crystallize'            // Observatory nodes solidify (0-2s)
  | 'glass-dissolve'         // Glass pane dissolves/thins (1-3s)
  | 'radial-wave'            // Color wave radiates outward (2-4s)
  | 'ambient-crescendo'      // Scene brightens (2-5s)
  | 'narration'              // Milestone caption (persistent 8s)
  | 'summary-transition'     // Transition to summary view (4s)
  | 'summary';               // Final static summary view

// ─── Tint ───

export type FinaleTint = 'green' | 'amber' | 'neutral';

// ─── Phase Timing ───

export interface PhaseTiming {
  readonly phase: FinalePhase;
  readonly startMs: number;
  readonly endMs: number;
}

/** Phase schedule for each convergence reason. */
export interface FinaleSchedule {
  readonly reason: ConvergenceReason;
  readonly tint: FinaleTint;
  readonly phases: readonly PhaseTiming[];
  readonly totalDurationMs: number;
}

// ─── Phase Schedules ───

/** Triumph: threshold-met — full crystallization, dissolution, green wave. */
export const THRESHOLD_MET_SCHEDULE: FinaleSchedule = {
  reason: 'threshold-met',
  tint: 'green',
  phases: [
    { phase: 'crystallize',        startMs: 0,    endMs: 2000 },
    { phase: 'glass-dissolve',     startMs: 1000, endMs: 3000 },
    { phase: 'radial-wave',        startMs: 2000, endMs: 4000 },
    { phase: 'ambient-crescendo',  startMs: 2000, endMs: 5000 },
    { phase: 'narration',          startMs: 3000, endMs: 11000 },
    { phase: 'summary-transition', startMs: 11000, endMs: 15000 },
  ],
  totalDurationMs: 15000,
};

/** Grace: no-proposals — amber tinting, glass thins but doesn't dissolve. */
export const NO_PROPOSALS_SCHEDULE: FinaleSchedule = {
  reason: 'no-proposals',
  tint: 'amber',
  phases: [
    { phase: 'crystallize',        startMs: 0,    endMs: 2000 },
    { phase: 'glass-dissolve',     startMs: 1000, endMs: 3000 },
    { phase: 'radial-wave',        startMs: 2000, endMs: 4000 },
    { phase: 'ambient-crescendo',  startMs: 2000, endMs: 5000 },
    { phase: 'narration',          startMs: 3000, endMs: 11000 },
    { phase: 'summary-transition', startMs: 11000, endMs: 15000 },
  ],
  totalDurationMs: 15000,
};

/** Honest stopping: budget/iterations exhausted — minimal ceremony. */
export const BUDGET_EXHAUSTED_SCHEDULE: FinaleSchedule = {
  reason: 'budget-exhausted',
  tint: 'neutral',
  phases: [
    { phase: 'narration',          startMs: 0,    endMs: 8000 },
    { phase: 'summary-transition', startMs: 8000, endMs: 12000 },
  ],
  totalDurationMs: 12000,
};

/** Get the appropriate schedule for a convergence reason. */
export function getFinaleSchedule(reason: ConvergenceReason): FinaleSchedule {
  switch (reason) {
    case 'threshold-met':
      return THRESHOLD_MET_SCHEDULE;
    case 'no-proposals':
      return NO_PROPOSALS_SCHEDULE;
    case 'budget-exhausted':
    case 'max-iterations':
      return BUDGET_EXHAUSTED_SCHEDULE;
  }
}

// ─── Visual State ───

/**
 * Immutable visual state of the convergence finale at a point in time.
 * The rendering layer reads this to drive scene element properties.
 */
export interface FinaleVisualState {
  /** Current overall phase (the latest active phase). */
  readonly phase: FinalePhase;
  /** Active phases (multiple phases can overlap in time). */
  readonly activePhases: ReadonlySet<FinalePhase>;
  /** Observatory crystallization progress [0, 1]. */
  readonly crystallizeProgress: number;
  /** Glass pane dissolution progress [0, 1].
   *  For threshold-met: 1.0 = fully dissolved.
   *  For no-proposals: clamped to 0.8 (glass thins but doesn't dissolve). */
  readonly glassDissolution: number;
  /** Radial wave expansion radius [0, 1] where 1 = fully expanded across scene. */
  readonly waveRadius: number;
  /** Ambient intensity multiplier [1.0, 1.5]. */
  readonly ambientMultiplier: number;
  /** Bloom intensity multiplier [1.0, 1.2]. */
  readonly bloomMultiplier: number;
  /** Narration visibility progress [0, 1]. */
  readonly narrationProgress: number;
  /** Summary view transition progress [0, 1]. */
  readonly summaryProgress: number;
  /** Tint color for all wave/glow effects. */
  readonly tint: FinaleTint;
  /** Whether the finale is complete (summary view reached). */
  readonly complete: boolean;
  /** Elapsed time since finale start in ms. */
  readonly elapsedMs: number;
}

// ─── Finale State ───

export interface FinaleState {
  /** Whether the finale has been triggered. */
  readonly active: boolean;
  /** The convergence reason that triggered the finale. */
  readonly reason: ConvergenceReason | null;
  /** The phase schedule being followed. */
  readonly schedule: FinaleSchedule | null;
  /** Start time of the finale (performance.now() or similar). */
  readonly startMs: number;
  /** Current visual state. */
  readonly visual: FinaleVisualState;
  /** Convergence metrics for narration caption generation. */
  readonly metrics: ConvergenceMetrics;
}

/** Metrics captured at the moment of convergence for narration. */
export interface ConvergenceMetrics {
  readonly iteration: number;
  readonly knowledgeHitRate: number;
  readonly passRate: number;
  readonly scenariosPassed: number;
  readonly totalScenarios: number;
  readonly proposalsPending: number;
  readonly proposalsActivated: number;
  readonly remainingGaps: number;
}

// ─── Initial States ───

const IDLE_VISUAL: FinaleVisualState = {
  phase: 'idle',
  activePhases: new Set(['idle']),
  crystallizeProgress: 0,
  glassDissolution: 0,
  waveRadius: 0,
  ambientMultiplier: 1.0,
  bloomMultiplier: 1.0,
  narrationProgress: 0,
  summaryProgress: 0,
  tint: 'neutral',
  complete: false,
  elapsedMs: 0,
};

const EMPTY_METRICS: ConvergenceMetrics = {
  iteration: 0,
  knowledgeHitRate: 0,
  passRate: 0,
  scenariosPassed: 0,
  totalScenarios: 0,
  proposalsPending: 0,
  proposalsActivated: 0,
  remainingGaps: 0,
};

export const INITIAL_FINALE_STATE: FinaleState = {
  active: false,
  reason: null,
  schedule: null,
  startMs: 0,
  visual: IDLE_VISUAL,
  metrics: EMPTY_METRICS,
};

// ─── Pure State Transitions ───

/**
 * Trigger the convergence finale.
 *
 * @param reason  Why convergence occurred
 * @param metrics  Snapshot of metrics at convergence
 * @param startMs  Performance timestamp for animation start
 * @returns New finale state with the appropriate schedule loaded
 */
export function triggerFinale(
  reason: ConvergenceReason,
  metrics: ConvergenceMetrics,
  startMs: number,
): FinaleState {
  const schedule = getFinaleSchedule(reason);
  return {
    active: true,
    reason,
    schedule,
    startMs,
    visual: { ...IDLE_VISUAL, tint: schedule.tint },
    metrics,
  };
}

/**
 * O(1). Advance the finale state machine by the current time.
 *
 * Computes the visual state at `currentMs` by checking which phases
 * are active and interpolating their progress values.
 *
 * @param state     Current finale state
 * @param currentMs Current performance timestamp
 * @returns New finale state with updated visual properties
 */
export function advanceFinale(state: FinaleState, currentMs: number): FinaleState {
  if (!state.active || !state.schedule) return state;

  const elapsed = currentMs - state.startMs;

  // Check if finale is complete
  if (elapsed >= state.schedule.totalDurationMs) {
    return {
      ...state,
      visual: {
        ...computeVisualState(state.schedule, elapsed),
        phase: 'summary',
        complete: true,
        elapsedMs: elapsed,
        tint: state.schedule.tint,
      },
    };
  }

  return {
    ...state,
    visual: {
      ...computeVisualState(state.schedule, elapsed),
      tint: state.schedule.tint,
      elapsedMs: elapsed,
    },
  };
}

// ─── Visual State Computation ───

function computeVisualState(schedule: FinaleSchedule, elapsedMs: number): FinaleVisualState {
  const activePhases = new Set<FinalePhase>();
  let latestPhase: FinalePhase = 'idle';

  for (const timing of schedule.phases) {
    if (elapsedMs >= timing.startMs && elapsedMs < timing.endMs) {
      activePhases.add(timing.phase);
      latestPhase = timing.phase;
    }
  }

  // If no phase is active but we haven't finished, we're between phases
  if (activePhases.size === 0 && elapsedMs < schedule.totalDurationMs) {
    // Find the last started phase
    for (const timing of schedule.phases) {
      if (elapsedMs >= timing.endMs) {
        latestPhase = timing.phase;
      }
    }
  }

  const isTriumph = schedule.reason === 'threshold-met';
  const isGrace = schedule.reason === 'no-proposals';

  return {
    phase: latestPhase,
    activePhases,
    crystallizeProgress: phaseProgress(schedule, 'crystallize', elapsedMs),
    glassDissolution: computeGlassDissolution(schedule, elapsedMs, isTriumph, isGrace),
    waveRadius: phaseProgress(schedule, 'radial-wave', elapsedMs),
    ambientMultiplier: computeAmbientMultiplier(schedule, elapsedMs, isTriumph || isGrace),
    bloomMultiplier: computeBloomMultiplier(schedule, elapsedMs, isTriumph || isGrace),
    narrationProgress: phaseProgress(schedule, 'narration', elapsedMs),
    summaryProgress: phaseProgress(schedule, 'summary-transition', elapsedMs),
    tint: schedule.tint,
    complete: elapsedMs >= schedule.totalDurationMs,
    elapsedMs,
  };
}

/** Compute progress [0, 1] within a specific phase. */
function phaseProgress(schedule: FinaleSchedule, phase: FinalePhase, elapsedMs: number): number {
  const timing = schedule.phases.find((p) => p.phase === phase);
  if (!timing) return 0;
  if (elapsedMs < timing.startMs) return 0;
  if (elapsedMs >= timing.endMs) return 1;
  return (elapsedMs - timing.startMs) / (timing.endMs - timing.startMs);
}

/** Glass dissolution depends on convergence reason. */
function computeGlassDissolution(
  schedule: FinaleSchedule,
  elapsedMs: number,
  isTriumph: boolean,
  isGrace: boolean,
): number {
  const rawProgress = phaseProgress(schedule, 'glass-dissolve', elapsedMs);
  if (isTriumph) return rawProgress; // Full dissolution
  if (isGrace) return rawProgress * 0.8; // Thin but don't dissolve
  return 0; // Budget exhausted — no dissolution
}

/** Ambient multiplier ramps from 1.0 to 1.5 during crescendo. */
function computeAmbientMultiplier(
  schedule: FinaleSchedule,
  elapsedMs: number,
  hasCrescendo: boolean,
): number {
  if (!hasCrescendo) return 1.0;
  const progress = phaseProgress(schedule, 'ambient-crescendo', elapsedMs);
  return 1.0 + progress * 0.5; // 1.0 → 1.5
}

/** Bloom multiplier ramps from 1.0 to 1.2 during crescendo. */
function computeBloomMultiplier(
  schedule: FinaleSchedule,
  elapsedMs: number,
  hasCrescendo: boolean,
): number {
  if (!hasCrescendo) return 1.0;
  const progress = phaseProgress(schedule, 'ambient-crescendo', elapsedMs);
  return 1.0 + progress * 0.2; // 1.0 → 1.2
}

// ─── Narration Caption Generation ───

/**
 * Generate the convergence narration caption text.
 *
 * Each convergence reason has a specific caption format from the spec.
 *
 * @param reason   Why convergence occurred
 * @param metrics  Metrics at convergence
 * @returns The narration caption text
 */
export function convergenceNarration(
  reason: ConvergenceReason,
  metrics: ConvergenceMetrics,
): string {
  const hitRatePercent = Math.round(metrics.knowledgeHitRate * 100);

  switch (reason) {
    case 'threshold-met':
      return `Converged at iteration ${metrics.iteration}. ${hitRatePercent}% knowledge hit rate. ${metrics.scenariosPassed}/${metrics.totalScenarios} scenarios green.`;

    case 'no-proposals':
      return `No further proposals. ${hitRatePercent}% knowledge hit rate. ${metrics.remainingGaps} knowledge gaps remain.`;

    case 'budget-exhausted':
      return `Budget exhausted after ${metrics.iteration} iterations. ${hitRatePercent}% knowledge hit rate. ${metrics.proposalsPending} proposals still pending.`;

    case 'max-iterations':
      return `Maximum iterations reached. ${hitRatePercent}% knowledge hit rate. ${metrics.remainingGaps} knowledge gaps remain.`;
  }
}
