/**
 * useInterventionMode — manages the fiber-pause decision gate experience.
 *
 * When the Effect fiber pauses for a human decision (fiber-paused event),
 * the visualization enters intervention mode:
 *
 *   1. Camera smoothly transitions to the relevant element/knowledge node
 *   2. Element glow intensifies (2× brightness, slower pulse)
 *   3. All other animations slow to 50% speed (scene feels suspended)
 *   4. Decision overlay appears: work item title, evidence confidence,
 *      proposed action, Approve/Skip buttons
 *   5. Narration: persistent "Awaiting human decision: {reason}"
 *   6. On decision: burst animation (green particles for approve,
 *      red scatter for skip), camera returns, fiber resumes
 *
 * The hook is pure state management — it doesn't render anything.
 * Components read the intervention state to modify their behavior.
 *
 * @see docs/first-day-flywheel-visualization.md Part VI: Intervention Mode
 */

import { useState, useCallback, useRef } from 'react';
import type { FlywheelAct } from '../types';

// ─── Types ───

/** Why the fiber paused. */
export type PauseReason =
  | 'approve-proposal'
  | 'interpret-step'
  | 'author-knowledge'
  | 'investigate-hotspot'
  | 'validate-calibration'
  | 'request-rerun';

/** Decision the operator can make. */
export type InterventionDecision = 'approved' | 'skipped';

/** Full context for the paused decision. */
export interface InterventionContext {
  readonly workItemId: string;
  readonly screen: string;
  readonly element: string | null;
  readonly reason: PauseReason;
  readonly title: string;
  readonly confidence: number;
  readonly proposedAction: string;
  readonly pausedAt: number; // timestamp (performance.now)
}

/** Visual modifiers that other components should apply during intervention. */
export interface InterventionVisualModifiers {
  /** Global animation speed multiplier (0.5 during intervention). */
  readonly animationSpeedMultiplier: number;
  /** Element glow brightness multiplier at the intervention target. */
  readonly targetGlowMultiplier: number;
  /** Element glow pulse frequency multiplier (slower pulse). */
  readonly targetPulseMultiplier: number;
  /** Whether the decision overlay should be visible. */
  readonly overlayVisible: boolean;
  /** Camera target override (element/node position). */
  readonly cameraTargetOverride: readonly [number, number, number] | null;
  /** Whether to show a burst animation on the next decision. */
  readonly burstPending: boolean;
}

/** Decision burst animation state. */
export interface DecisionBurstState {
  readonly active: boolean;
  readonly decision: InterventionDecision | null;
  readonly position: readonly [number, number, number] | null;
  readonly progress: number; // [0, 1]
  readonly startTime: number;
}

/** Complete intervention mode state. */
export interface InterventionModeState {
  /** Whether intervention mode is active. */
  readonly active: boolean;
  /** Current intervention context (null when not active). */
  readonly context: InterventionContext | null;
  /** Visual modifiers for other components. */
  readonly modifiers: InterventionVisualModifiers;
  /** Decision burst animation state. */
  readonly burst: DecisionBurstState;
  /** Number of interventions completed this session. */
  readonly completedCount: number;
  /** Total time spent in intervention mode (ms). */
  readonly totalInterventionTimeMs: number;

  /** Enter intervention mode with a new pause context. */
  readonly enterIntervention: (context: InterventionContext) => void;
  /** Submit a decision and exit intervention mode. */
  readonly submitDecision: (decision: InterventionDecision) => void;
  /** Advance burst animation (call from rAF loop). */
  readonly advanceBurst: (now: number) => void;
}

// ─── Constants ───

const INTERVENTION_ANIMATION_SPEED = 0.5;
const TARGET_GLOW_MULTIPLIER = 2.0;
const TARGET_PULSE_MULTIPLIER = 0.5; // Slower pulse
const BURST_DURATION_MS = 1200;

const DEFAULT_MODIFIERS: InterventionVisualModifiers = {
  animationSpeedMultiplier: 1.0,
  targetGlowMultiplier: 1.0,
  targetPulseMultiplier: 1.0,
  overlayVisible: false,
  cameraTargetOverride: null,
  burstPending: false,
};

const ACTIVE_MODIFIERS_BASE: Omit<InterventionVisualModifiers, 'cameraTargetOverride' | 'burstPending'> = {
  animationSpeedMultiplier: INTERVENTION_ANIMATION_SPEED,
  targetGlowMultiplier: TARGET_GLOW_MULTIPLIER,
  targetPulseMultiplier: TARGET_PULSE_MULTIPLIER,
  overlayVisible: true,
};

const INITIAL_BURST: DecisionBurstState = {
  active: false,
  decision: null,
  position: null,
  progress: 0,
  startTime: 0,
};

// ─── Hook ───

export function useInterventionMode(): InterventionModeState {
  const [active, setActive] = useState(false);
  const [context, setContext] = useState<InterventionContext | null>(null);
  const [modifiers, setModifiers] = useState<InterventionVisualModifiers>(DEFAULT_MODIFIERS);
  const [burst, setBurst] = useState<DecisionBurstState>(INITIAL_BURST);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalInterventionTimeMs, setTotalInterventionTimeMs] = useState(0);

  const enterTimeRef = useRef(0);

  const enterIntervention = useCallback((ctx: InterventionContext) => {
    setActive(true);
    setContext(ctx);
    enterTimeRef.current = performance.now();

    // Compute camera target from element position
    // (In real usage, this would come from DOM-to-world mapping.
    //  For now, use a sentinel position based on the screen.)
    const cameraTarget: readonly [number, number, number] = ctx.element
      ? [-1.8, 0, 0] // Screen plane area
      : [0, 0, 0];   // Scene center

    setModifiers({
      ...ACTIVE_MODIFIERS_BASE,
      cameraTargetOverride: cameraTarget,
      burstPending: false,
    });
  }, []);

  const submitDecision = useCallback((decision: InterventionDecision) => {
    const timeSpent = performance.now() - enterTimeRef.current;

    // Start burst animation
    const burstPosition: readonly [number, number, number] = context?.element
      ? [-1.8, 0, 0]
      : [0, 0, 0];

    setBurst({
      active: true,
      decision,
      position: burstPosition,
      progress: 0,
      startTime: performance.now(),
    });

    // Exit intervention mode
    setActive(false);
    setContext(null);
    setModifiers({
      ...DEFAULT_MODIFIERS,
      burstPending: true,
    });

    setCompletedCount((prev) => prev + 1);
    setTotalInterventionTimeMs((prev) => prev + timeSpent);
  }, [context]);

  const advanceBurst = useCallback((now: number) => {
    setBurst((prev) => {
      if (!prev.active) return prev;
      const elapsed = now - prev.startTime;
      const progress = Math.min(1, elapsed / BURST_DURATION_MS);

      if (progress >= 1) {
        return INITIAL_BURST;
      }

      return { ...prev, progress };
    });
  }, []);

  return {
    active,
    context,
    modifiers,
    burst,
    completedCount,
    totalInterventionTimeMs,
    enterIntervention,
    submitDecision,
    advanceBurst,
  };
}

// ─── Pure Helpers ───

/**
 * Compute the burst particle properties for the decision animation.
 *
 * Approve: Green particles arc toward knowledge observatory.
 * Skip: Red particles scatter outward.
 *
 * @param decision What the operator decided
 * @param progress Burst progress [0, 1]
 * @returns Particle color and direction
 */
export function burstParticleProps(
  decision: InterventionDecision,
  progress: number,
): { readonly color: string; readonly directionBias: readonly [number, number, number]; readonly count: number } {
  if (decision === 'approved') {
    return {
      color: '#22c55e',
      directionBias: [1.5, 0, 0], // Arc toward observatory (right)
      count: 24,
    };
  }
  return {
    color: '#ef4444',
    directionBias: [0, 0, 0], // Scatter uniformly
    count: 16,
  };
}

/**
 * Check if a PauseContext from the main pipeline should trigger intervention mode.
 * Maps the general PauseContext to the specific InterventionContext.
 */
export function shouldTriggerIntervention(
  event: { readonly workItemId: string; readonly screen: string; readonly element: string | null; readonly reason: string },
): boolean {
  const validReasons: readonly string[] = [
    'approve-proposal',
    'interpret-step',
    'author-knowledge',
    'investigate-hotspot',
    'validate-calibration',
    'request-rerun',
  ];
  return validReasons.includes(event.reason);
}
