/**
 * Timing Baseline — execution timing regression detection.
 *
 * After each run, computes per-phase timing baselines (median, p95, stddev)
 * from recent run history, then flags steps where any phase exceeds
 * `p95 * regressionThreshold` as a timing regression.
 *
 * All functions are pure — no side effects, no mutation.
 */

import type { StepExecutionReceipt } from '../domain/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TimingPhase = 'setupMs' | 'resolutionMs' | 'actionMs' | 'assertionMs' | 'retriesMs' | 'teardownMs' | 'totalMs';

export const TIMING_PHASES: readonly TimingPhase[] = [
  'setupMs', 'resolutionMs', 'actionMs', 'assertionMs', 'retriesMs', 'teardownMs', 'totalMs',
] as const;

export interface PhaseBaseline {
  readonly phase: TimingPhase;
  readonly median: number;
  readonly p95: number;
  readonly stddev: number;
  readonly sampleCount: number;
}

export interface StepTimingBaseline {
  readonly stepCategory: string;
  readonly phases: readonly PhaseBaseline[];
  readonly updatedAt: string;
}

export interface TimingBaselineIndex {
  readonly kind: 'timing-baseline-index';
  readonly version: 1;
  readonly baselines: readonly StepTimingBaseline[];
  readonly updatedAt: string;
}

export interface TimingRegression {
  readonly stepIndex: number;
  readonly stepCategory: string;
  readonly phase: TimingPhase;
  readonly actual: number;
  readonly p95: number;
  readonly ratio: number;
}

export interface TimingRegressionReport {
  readonly regressions: readonly TimingRegression[];
  readonly regressionRate: number;
  readonly totalSteps: number;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface TimingBaselineConfig {
  /** Threshold multiplier over p95 to flag as regression. Default: 1.5 */
  readonly regressionThreshold: number;
  /** Minimum sample count before baselines are considered reliable. Default: 3 */
  readonly minSamples: number;
  /** Maximum number of recent data points to keep per category. Default: 50 */
  readonly maxHistory: number;
}

export const DEFAULT_TIMING_BASELINE_CONFIG: TimingBaselineConfig = {
  regressionThreshold: 1.5,
  minSamples: 3,
  maxHistory: 50,
};

// ─── Pure functions ─────────────────────────────────────────────────────────

/** Derive a step category from execution metadata for grouping. */
export function stepCategory(step: StepExecutionReceipt): string {
  const widget = step.widgetContract ?? 'unknown';
  const mode = step.mode ?? 'default';
  return `${widget}:${mode}`;
}

/** Compute median of a sorted number array. Pure. */
export function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Compute the p-th percentile of a sorted number array. Pure. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

/** Compute standard deviation. Pure. */
export function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Extract timing for a specific phase from a step receipt. */
export function phaseValue(step: StepExecutionReceipt, phase: TimingPhase): number {
  return step.timing[phase];
}

/**
 * Build phase baselines from a collection of timing samples.
 * Each sample is a number[] per phase, pre-grouped by step category.
 */
export function buildPhaseBaselines(
  phaseSamples: ReadonlyMap<TimingPhase, readonly number[]>,
): readonly PhaseBaseline[] {
  return TIMING_PHASES.map((phase) => {
    const raw = phaseSamples.get(phase) ?? [];
    const sorted = [...raw].sort((a, b) => a - b);
    return {
      phase,
      median: median(sorted),
      p95: percentile(sorted, 95),
      stddev: stddev(sorted),
      sampleCount: sorted.length,
    };
  });
}

/**
 * Update timing baselines by incorporating new step data from a run.
 * Returns a new baseline index. Pure — no mutation.
 */
export function updateTimingBaselines(
  existing: TimingBaselineIndex | null,
  newSteps: readonly StepExecutionReceipt[],
  config?: TimingBaselineConfig,
): TimingBaselineIndex {
  const effectiveConfig = config ?? DEFAULT_TIMING_BASELINE_CONFIG;
  const now = new Date().toISOString();

  // Group new steps by category
  const newByCategory = new Map<string, StepExecutionReceipt[]>();
  for (const step of newSteps) {
    const cat = stepCategory(step);
    const arr = newByCategory.get(cat) ?? [];
    arr.push(step);
    newByCategory.set(cat, arr);
  }

  // Merge with existing baselines
  const existingMap = new Map<string, StepTimingBaseline>(
    (existing?.baselines ?? []).map((b) => [b.stepCategory, b]),
  );

  const allCategories = new Set([...existingMap.keys(), ...newByCategory.keys()]);
  const updatedBaselines: StepTimingBaseline[] = [];

  for (const cat of allCategories) {
    const existingBaseline = existingMap.get(cat);
    const newStepsForCat = newByCategory.get(cat) ?? [];

    // Collect phase samples: existing baseline values (reconstructed) + new
    const phaseSamples = new Map<TimingPhase, number[]>();
    for (const phase of TIMING_PHASES) {
      const existingPhase = existingBaseline?.phases.find((p) => p.phase === phase);
      // We don't have raw history, so we approximate by using the existing
      // median repeated by sampleCount. For new data, we add raw values.
      const existingValues: number[] = existingPhase
        ? Array(Math.min(existingPhase.sampleCount, effectiveConfig.maxHistory))
            .fill(existingPhase.median) as number[]
        : [];
      const newValues = newStepsForCat.map((step) => phaseValue(step, phase));
      const combined = [...existingValues, ...newValues].slice(-effectiveConfig.maxHistory);
      phaseSamples.set(phase, combined);
    }

    updatedBaselines.push({
      stepCategory: cat,
      phases: buildPhaseBaselines(phaseSamples),
      updatedAt: now,
    });
  }

  return {
    kind: 'timing-baseline-index',
    version: 1,
    baselines: updatedBaselines,
    updatedAt: now,
  };
}

/**
 * Extract timing observations from step execution receipts.
 * Each step produces one observation with all phase timings.
 */
export interface TimingObservation {
  readonly category: string;
  readonly phases: Readonly<Record<TimingPhase, number>>;
  readonly runAt: string;
}

export function extractTimingObservations(
  steps: readonly StepExecutionReceipt[],
): readonly TimingObservation[] {
  return steps.map((step) => ({
    category: stepCategory(step),
    phases: Object.fromEntries(
      TIMING_PHASES.map((phase) => [phase, phaseValue(step, phase)]),
    ) as unknown as Readonly<Record<TimingPhase, number>>,
    runAt: step.runAt,
  }));
}

/**
 * Compute baseline coverage health: fraction of categories with
 * statistically meaningful sample counts (≥ minSamples across all phases).
 * Returns [0, 1] where 1 = all categories are well-sampled.
 */
export function computeBaselineCoverage(
  index: TimingBaselineIndex,
  config?: TimingBaselineConfig,
): number {
  const effectiveConfig = config ?? DEFAULT_TIMING_BASELINE_CONFIG;
  if (index.baselines.length === 0) return 1; // no baselines needed = healthy
  const wellSampled = index.baselines.filter((b) =>
    b.phases.every((p) => p.sampleCount >= effectiveConfig.minSamples),
  );
  return wellSampled.length / index.baselines.length;
}

/**
 * Detect timing regressions by comparing step timings against baselines.
 * Pure function — no side effects.
 */
export function detectTimingRegressions(
  steps: readonly StepExecutionReceipt[],
  baselines: TimingBaselineIndex,
  config?: TimingBaselineConfig,
): TimingRegressionReport {
  const effectiveConfig = config ?? DEFAULT_TIMING_BASELINE_CONFIG;
  const baselineMap = new Map(baselines.baselines.map((b) => [b.stepCategory, b]));

  const regressions: TimingRegression[] = [];

  for (const step of steps) {
    const cat = stepCategory(step);
    const baseline = baselineMap.get(cat);
    if (!baseline) continue;

    for (const phaseBaseline of baseline.phases) {
      if (phaseBaseline.sampleCount < effectiveConfig.minSamples) continue;
      if (phaseBaseline.p95 === 0) continue; // avoid division by zero

      const actual = phaseValue(step, phaseBaseline.phase);
      const threshold = phaseBaseline.p95 * effectiveConfig.regressionThreshold;

      if (actual > threshold) {
        regressions.push({
          stepIndex: step.stepIndex,
          stepCategory: cat,
          phase: phaseBaseline.phase,
          actual,
          p95: phaseBaseline.p95,
          ratio: actual / phaseBaseline.p95,
        });
      }
    }
  }

  return {
    regressions,
    regressionRate: steps.length > 0
      ? new Set(regressions.map((r) => r.stepIndex)).size / steps.length
      : 0,
    totalSteps: steps.length,
  };
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Timing baseline as ObservationCollapse<R,O,A,S>:
//   extract: StepExecutionReceipt → TimingObservation
//   aggregate: TimingObservation → TimingBaselineIndex
//   signal: TimingBaselineIndex → number (baseline coverage health)
//
// Structural note: this module also has detectTimingRegressions with shape
// (R[], A) → S — the "Observation-Aggregate-Compare" pattern where the
// signal needs both the new receipts AND the aggregate. That pattern is
// strictly more expressive than ObservationCollapse (it's the comonad
// extract that remembers its context). The collapse instance here uses
// the simpler A → S signal via baseline coverage health.

import type { ObservationCollapse } from '../domain/kernel/observation-collapse';

export const timingBaselineCollapse: ObservationCollapse<
  StepExecutionReceipt,
  TimingObservation,
  TimingBaselineIndex,
  number
> = {
  extract: extractTimingObservations,
  aggregate: (observations, prior) => {
    // Reconstruct steps-like data from observations for updateTimingBaselines.
    // Since updateTimingBaselines takes StepExecutionReceipt[], we build
    // baselines directly from observations here.
    if (observations.length === 0 && prior) return prior;
    const now = new Date().toISOString();

    // Group observations by category
    const byCategory = new Map<string, TimingObservation[]>();
    for (const obs of observations) {
      const arr = byCategory.get(obs.category) ?? [];
      arr.push(obs);
      byCategory.set(obs.category, arr);
    }

    // Merge with prior baselines
    const existingMap = new Map<string, StepTimingBaseline>(
      (prior?.baselines ?? []).map((b) => [b.stepCategory, b]),
    );
    const allCategories = new Set([...existingMap.keys(), ...byCategory.keys()]);
    const baselines: StepTimingBaseline[] = [];

    for (const cat of allCategories) {
      const existingBaseline = existingMap.get(cat);
      const newObs = byCategory.get(cat) ?? [];

      const phaseSamples = new Map<TimingPhase, number[]>();
      for (const phase of TIMING_PHASES) {
        const existingPhase = existingBaseline?.phases.find((p) => p.phase === phase);
        const existingValues: number[] = existingPhase
          ? Array(Math.min(existingPhase.sampleCount, 50)).fill(existingPhase.median) as number[]
          : [];
        const newValues = newObs.map((o) => o.phases[phase]);
        phaseSamples.set(phase, [...existingValues, ...newValues].slice(-50));
      }

      baselines.push({
        stepCategory: cat,
        phases: buildPhaseBaselines(phaseSamples),
        updatedAt: now,
      });
    }

    return { kind: 'timing-baseline-index', version: 1, baselines, updatedAt: now };
  },
  signal: computeBaselineCoverage,
};
