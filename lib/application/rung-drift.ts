/**
 * Resolution Rung Drift Detector — tracks per-intent resolution rung
 * changes over time to detect knowledge degradation.
 *
 * The system has an 11-rung resolution precedence ladder. fitness.ts computes
 * aggregate `resolutionByRung` counts, but nobody tracks per-intent drift:
 * when a selector that used to resolve at rung 3 (approved-knowledge) starts
 * falling to rung 8 (LLM-DOM) or rung 9 (agent-interpreted), that's a leading
 * indicator of knowledge degradation.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { StepExecutionReceipt } from '../domain/types';

// ─── Types ───

export type RungDriftDirection = 'improving' | 'stable' | 'degrading';

export interface RungObservation {
  readonly intentRef: string;
  readonly rung: number;
  readonly succeeded: boolean;
  readonly runAt: string;
}

export interface RungHistoryEntry {
  readonly intentRef: string;
  readonly rungHistory: readonly number[];
  readonly modalRung: number;
  readonly currentRung: number;
  readonly driftDirection: RungDriftDirection;
}

export interface RungHistoryIndex {
  readonly entries: readonly RungHistoryEntry[];
}

export interface RungDrift {
  readonly intentRef: string;
  readonly previousModalRung: number;
  readonly currentRung: number;
  readonly delta: number;
}

export interface RungDriftReport {
  readonly drifts: readonly RungDrift[];
  readonly driftRate: number;
}

export interface RungDriftConfig {
  readonly minObservations: number;
  readonly driftThreshold: number;
}

export const DEFAULT_RUNG_DRIFT_CONFIG: RungDriftConfig = {
  minObservations: 3,
  driftThreshold: 1,
};

// ─── Intent key ───

/**
 * Deterministic intent reference from step fields.
 * Uses widgetContract:mode as a stable identity for the "what" of a step.
 */
export function intentRef(step: StepExecutionReceipt): string {
  const widget = step.widgetContract ?? 'unknown';
  const mode = step.mode ?? 'unknown';
  return `${widget}:${mode}`;
}

// ─── Extraction ───

/**
 * Extract rung observations from step execution receipts.
 * Only includes steps that have a locatorRung assigned.
 */
export function extractRungObservations(
  steps: readonly StepExecutionReceipt[],
): readonly RungObservation[] {
  return steps
    .filter((step): step is StepExecutionReceipt & { readonly locatorRung: number } =>
      step.locatorRung != null,
    )
    .map((step) => ({
      intentRef: intentRef(step),
      rung: step.locatorRung,
      succeeded: step.failure.family === 'none',
      runAt: step.runAt,
    }));
}

// ─── Statistics ───

/**
 * Compute the mode (most frequent value) of a number array.
 * On ties, returns the lowest value (higher precedence rung = better).
 */
export function mode(values: readonly number[]): number {
  if (values.length === 0) return 0;

  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let bestValue = values[0]!;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue;
}

/**
 * Determine drift direction by comparing first-half modal rung to second-half.
 * Higher rung numbers = lower precedence = degradation.
 */
function computeDriftDirection(
  history: readonly number[],
  config: RungDriftConfig,
): RungDriftDirection {
  if (history.length < config.minObservations) return 'stable';

  const mid = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, mid);
  const secondHalf = history.slice(mid);

  const firstMode = mode(firstHalf);
  const secondMode = mode(secondHalf);
  const delta = secondMode - firstMode;

  if (delta >= config.driftThreshold) return 'degrading';
  if (delta <= -config.driftThreshold) return 'improving';
  return 'stable';
}

// ─── History building ───

/**
 * Build rung history from observations, grouped by intent.
 * Maintains temporal ordering within each intent group.
 */
export function buildRungHistory(
  observations: readonly RungObservation[],
  config: RungDriftConfig = DEFAULT_RUNG_DRIFT_CONFIG,
): RungHistoryIndex {
  if (observations.length === 0) {
    return { entries: [] };
  }

  const groups = new Map<string, RungObservation[]>();
  for (const obs of observations) {
    const existing = groups.get(obs.intentRef);
    if (existing) {
      existing.push(obs);
    } else {
      groups.set(obs.intentRef, [obs]);
    }
  }

  // Cap rung history per intent to last 20 observations and total entries to 500
  // to prevent unbounded growth with many unique intents.
  const MAX_HISTORY_PER_INTENT = 20;
  const MAX_ENTRIES = 500;

  const entries: RungHistoryEntry[] = [...groups.entries()]
    .map(([intent, obs]) => {
      const sorted = [...obs].sort((a, b) => a.runAt.localeCompare(b.runAt));
      const rungHistory = sorted.slice(-MAX_HISTORY_PER_INTENT).map((o) => o.rung);
      const modalRung = mode(rungHistory);
      const currentRung = rungHistory[rungHistory.length - 1]!;

      return {
        intentRef: intent,
        rungHistory,
        modalRung,
        currentRung,
        driftDirection: computeDriftDirection(rungHistory, config),
      };
    })
    .sort((a, b) => a.intentRef.localeCompare(b.intentRef))
    .slice(0, MAX_ENTRIES);

  return { entries };
}

// ─── Drift detection ───

/**
 * Detect intents whose resolution rung has drifted to lower precedence.
 * A drift means the current rung is worse (higher number) than the modal rung.
 */
export function detectRungDrift(
  history: RungHistoryIndex,
  config: RungDriftConfig = DEFAULT_RUNG_DRIFT_CONFIG,
): RungDriftReport {
  const drifts: RungDrift[] = history.entries
    .filter((entry) =>
      entry.rungHistory.length >= config.minObservations
      && entry.driftDirection === 'degrading',
    )
    .map((entry) => ({
      intentRef: entry.intentRef,
      previousModalRung: entry.modalRung,
      currentRung: entry.currentRung,
      delta: entry.currentRung - entry.modalRung,
    }));

  return {
    drifts,
    driftRate: history.entries.length > 0 ? drifts.length / history.entries.length : 0,
  };
}

// ─── Stability ───

/**
 * Compute rung stability: fraction of intents with stable rung assignment.
 * Returns [0, 1] where 1 = all intents are stable.
 */
export function computeRungStability(
  history: RungHistoryIndex,
): number {
  if (history.entries.length === 0) return 1;

  const stableCount = history.entries.filter(
    (entry) => entry.driftDirection === 'stable' || entry.driftDirection === 'improving',
  ).length;

  return stableCount / history.entries.length;
}
