/**
 * @deprecated Playwright is now the default execution mode. The two-pass
 * "diagnostic then escalate" approach has been replaced by single-pass
 * browser-first execution. This module is retained for backward compatibility
 * but is no longer invoked by the speedrun/dogfood loop.
 *
 * Playwright Escalation Policy — decides which scenarios need browser
 * execution after a diagnostic-mode iteration.
 *
 * The speedrun starts in diagnostic mode (fast, no browser). After each
 * iteration, this policy inspects resolution receipts and selects scenarios
 * that need escalation to headless Playwright execution:
 *
 *   1. Steps that resolved to 'needs-human' (no resolution found)
 *   2. Steps with low-confidence 'agent-proposed' interpretations
 *   3. Steps where DOM exploration or live-dom was the winning source
 *
 * Escalated scenarios are re-run with a real browser page, allowing the
 * resolution pipeline to use live DOM, ARIA snapshots, and visual reasoning.
 *
 * Pure function: run records → escalation decisions.
 */

import type { AdoId } from '../../product/domain/kernel/identity';

// ─── Types ───

export interface EscalationDecision {
  /** Scenarios that should be re-run with Playwright. */
  readonly escalatedScenarios: readonly EscalatedScenario[];
  /** Total steps analyzed. */
  readonly totalSteps: number;
  /** Steps that need escalation. */
  readonly escalatedSteps: number;
  /** Summary reason for escalation. */
  readonly summary: string;
}

export interface EscalatedScenario {
  readonly adoId: AdoId;
  /** Step indices within this scenario that triggered escalation. */
  readonly triggerStepIndices: readonly number[];
  /** Most severe escalation reason across all trigger steps. */
  readonly primaryReason: EscalationReason;
  /** Combined priority score (higher = more urgent). */
  readonly priority: number;
}

export type EscalationReason =
  | 'needs-human'
  | 'agent-proposed-low-confidence'
  | 'live-dom-fallback'
  | 'rung-drift-detected';

// ─── Policy Configuration ───

export interface EscalationThresholds {
  /** Escalate agent-proposed steps below this confidence score. Default: 0.6. */
  readonly agentProposedConfidenceFloor: number;
  /** Maximum number of scenarios to escalate per iteration. Default: 10. */
  readonly maxEscalatedScenarios: number;
  /** Minimum iteration before escalation is considered. Default: 1. */
  readonly minIterationForEscalation: number;
}

const DEFAULT_THRESHOLDS: EscalationThresholds = {
  agentProposedConfidenceFloor: 0.6,
  maxEscalatedScenarios: 10,
  minIterationForEscalation: 1,
};

// ─── Step Analysis ───

interface StepSignal {
  readonly adoId: AdoId;
  readonly stepIndex: number;
  readonly reason: EscalationReason;
  readonly priority: number;
}

/**
 * Confidence scores for resolution receipts.
 * Same mapping as run.ts RUNG_ORDER but inverted for escalation priority.
 */
const CONFIDENCE_TO_PRIORITY: Record<string, number> = {
  'unbound': 1.0,           // needs-human: highest priority
  'agent-proposed': 0.8,    // low-confidence agent guess
  'agent-verified': 0.3,    // agent-verified: low priority
  'compiler-derived': 0.1,  // deterministic: rarely escalate
};

const RUNG_ESCALATION_PRIORITY: Record<string, number> = {
  'needs-human': 1.0,
  'agent-interpreted': 0.8,
  'live-dom': 0.6,
  'structured-translation': 0.3,
};

function analyzeStep(
  adoId: AdoId,
  stepIndex: number,
  interpretation: {
    readonly kind: string;
    readonly confidence?: string;
    readonly winningSource?: string;
  },
  thresholds: EscalationThresholds,
): StepSignal | null {
  // Needs-human: always escalate
  if (interpretation.kind === 'needs-human') {
    return {
      adoId,
      stepIndex,
      reason: 'needs-human',
      priority: CONFIDENCE_TO_PRIORITY['unbound'] ?? 1.0,
    };
  }

  // Low-confidence agent-proposed
  if (
    interpretation.confidence === 'agent-proposed'
    && (CONFIDENCE_TO_PRIORITY[interpretation.confidence] ?? 0) >= thresholds.agentProposedConfidenceFloor
  ) {
    return {
      adoId,
      stepIndex,
      reason: 'agent-proposed-low-confidence',
      priority: CONFIDENCE_TO_PRIORITY['agent-proposed'] ?? 0.8,
    };
  }

  // Live-dom fallback: the step needed DOM exploration, which only
  // works properly with a real browser
  if (interpretation.winningSource === 'live-dom' || interpretation.winningSource === 'agent-interpreted') {
    return {
      adoId,
      stepIndex,
      reason: 'live-dom-fallback',
      priority: RUNG_ESCALATION_PRIORITY[interpretation.winningSource] ?? 0.5,
    };
  }

  return null;
}

// ─── Main Policy Function ───

/**
 * Evaluate which scenarios need Playwright escalation based on run results.
 *
 * Pure function: inspects step interpretation receipts and returns
 * a prioritized list of scenarios to re-run with a real browser.
 */
export function evaluateEscalationPolicy(
  runSteps: readonly {
    readonly adoId: AdoId;
    readonly stepIndex: number;
    readonly interpretation: {
      readonly kind: string;
      readonly confidence?: string;
      readonly winningSource?: string;
    };
  }[],
  iteration: number,
  thresholds: EscalationThresholds = DEFAULT_THRESHOLDS,
): EscalationDecision {
  // Don't escalate before minimum iteration threshold
  if (iteration < thresholds.minIterationForEscalation) {
    return {
      escalatedScenarios: [],
      totalSteps: runSteps.length,
      escalatedSteps: 0,
      summary: `Iteration ${iteration} below minimum ${thresholds.minIterationForEscalation} for escalation`,
    };
  }

  // Analyze each step for escalation signals
  const signals: StepSignal[] = [];
  for (const step of runSteps) {
    const signal = analyzeStep(step.adoId, step.stepIndex, step.interpretation, thresholds);
    if (signal) signals.push(signal);
  }

  if (signals.length === 0) {
    return {
      escalatedScenarios: [],
      totalSteps: runSteps.length,
      escalatedSteps: 0,
      summary: 'No steps require Playwright escalation',
    };
  }

  // Group by scenario and compute per-scenario priority
  const byScenario = new Map<string, StepSignal[]>();
  for (const signal of signals) {
    const key = signal.adoId as string;
    const group = byScenario.get(key) ?? [];
    group.push(signal);
    byScenario.set(key, group);
  }

  // Build prioritized scenario list
  const scenarios: EscalatedScenario[] = [];
  for (const [adoId, stepSignals] of byScenario) {
    const maxPriority = Math.max(...stepSignals.map((s) => s.priority));
    const primaryReason = stepSignals.reduce<EscalationReason>(
      (best, s) => s.priority > (CONFIDENCE_TO_PRIORITY[best] ?? 0) ? s.reason : best,
      stepSignals[0]!.reason,
    );

    scenarios.push({
      adoId: adoId as AdoId,
      triggerStepIndices: stepSignals.map((s) => s.stepIndex),
      primaryReason,
      priority: maxPriority,
    });
  }

  // Sort by priority (highest first) and cap
  scenarios.sort((a, b) => b.priority - a.priority);
  const capped = scenarios.slice(0, thresholds.maxEscalatedScenarios);

  const reasonCounts = new Map<EscalationReason, number>();
  for (const s of capped) {
    reasonCounts.set(s.primaryReason, (reasonCounts.get(s.primaryReason) ?? 0) + 1);
  }
  const reasonSummary = [...reasonCounts.entries()]
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ');

  return {
    escalatedScenarios: capped,
    totalSteps: runSteps.length,
    escalatedSteps: signals.length,
    summary: `${capped.length}/${byScenario.size} scenarios escalated (${reasonSummary})`,
  };
}
