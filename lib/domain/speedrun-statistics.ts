/**
 * Pure statistical functions for speedrun phase timing analysis.
 *
 * Provides mean, standard deviation, p99 thresholds, and regression detection
 * for phase durations. All functions are pure — no I/O, no side effects.
 */

// ─── Core statistics ───

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

// ─── Phase timing types ───

export type SpeedrunPhase = 'generate' | 'compile' | 'iterate' | 'fitness' | 'complete';

export interface PhaseTimingSample {
  readonly phase: SpeedrunPhase;
  readonly durationMs: number;
  readonly iteration?: number;
  readonly seed: string;
  readonly wallClockMs: number;
}

export interface PhaseTimingBaseline {
  readonly phase: SpeedrunPhase;
  readonly sampleCount: number;
  readonly meanMs: number;
  readonly stddevMs: number;
  readonly p99Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

export interface PhaseTimingBudget {
  readonly phase: SpeedrunPhase;
  /** Hard timeout — abort if exceeded. Derived from p99 + 3σ. */
  readonly timeoutMs: number;
  /** Warning threshold — log if exceeded. Derived from p99 + 1σ. */
  readonly warningMs: number;
  /** Expected duration — the mean. */
  readonly expectedMs: number;
}

export type RegressionSeverity = 'none' | 'warning' | 'regression';

export interface RegressionSignal {
  readonly phase: SpeedrunPhase;
  readonly severity: RegressionSeverity;
  readonly currentMs: number;
  readonly baselineMeanMs: number;
  readonly baselineStddevMs: number;
  /** Number of standard deviations above the mean. */
  readonly zScore: number;
  readonly message: string;
}

// ─── Baseline computation ───

export function computePhaseBaseline(
  phase: SpeedrunPhase,
  samples: readonly PhaseTimingSample[],
): PhaseTimingBaseline {
  const phaseSamples = samples
    .filter((s) => s.phase === phase)
    .map((s) => s.durationMs);

  return {
    phase,
    sampleCount: phaseSamples.length,
    meanMs: mean(phaseSamples),
    stddevMs: standardDeviation(phaseSamples),
    p99Ms: percentile(phaseSamples, 99),
    minMs: phaseSamples.length > 0 ? Math.min(...phaseSamples) : 0,
    maxMs: phaseSamples.length > 0 ? Math.max(...phaseSamples) : 0,
  };
}

export function computeAllBaselines(
  samples: readonly PhaseTimingSample[],
): readonly PhaseTimingBaseline[] {
  const phases: readonly SpeedrunPhase[] = ['generate', 'compile', 'iterate', 'fitness', 'complete'];
  return phases
    .map((phase) => computePhaseBaseline(phase, samples))
    .filter((baseline) => baseline.sampleCount > 0);
}

// ─── Budget derivation ───

/** Default multipliers for budget derivation from baselines. */
export interface BudgetMultipliers {
  /** Warning threshold = p99 + warningStddevs × σ. Default: 1. */
  readonly warningStddevs: number;
  /** Hard timeout = p99 + timeoutStddevs × σ. Default: 3. */
  readonly timeoutStddevs: number;
  /** Minimum timeout in ms regardless of statistics. Default: 10000 (10s). */
  readonly floorMs: number;
}

export const DEFAULT_BUDGET_MULTIPLIERS: BudgetMultipliers = {
  warningStddevs: 1,
  timeoutStddevs: 3,
  floorMs: 10_000,
};

export function deriveBudget(
  baseline: PhaseTimingBaseline,
  multipliers: BudgetMultipliers = DEFAULT_BUDGET_MULTIPLIERS,
): PhaseTimingBudget {
  const warningMs = Math.max(
    multipliers.floorMs,
    baseline.p99Ms + multipliers.warningStddevs * baseline.stddevMs,
  );
  const timeoutMs = Math.max(
    multipliers.floorMs,
    baseline.p99Ms + multipliers.timeoutStddevs * baseline.stddevMs,
  );

  return {
    phase: baseline.phase,
    timeoutMs: Math.round(timeoutMs),
    warningMs: Math.round(warningMs),
    expectedMs: Math.round(baseline.meanMs),
  };
}

export function deriveAllBudgets(
  baselines: readonly PhaseTimingBaseline[],
  multipliers: BudgetMultipliers = DEFAULT_BUDGET_MULTIPLIERS,
): readonly PhaseTimingBudget[] {
  return baselines.map((baseline) => deriveBudget(baseline, multipliers));
}

// ─── Regression detection ───

/** Thresholds for classifying a timing observation against a baseline. */
export interface RegressionThresholds {
  /** Z-score above which we emit a warning. Default: 2. */
  readonly warningZScore: number;
  /** Z-score above which we declare a regression. Default: 3. */
  readonly regressionZScore: number;
  /** Minimum absolute delta (ms) to trigger. Prevents noise on fast phases. Default: 1000. */
  readonly minimumDeltaMs: number;
}

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  warningZScore: 2,
  regressionZScore: 3,
  minimumDeltaMs: 1_000,
};

export function detectRegression(
  baseline: PhaseTimingBaseline,
  currentMs: number,
  thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS,
): RegressionSignal {
  const delta = currentMs - baseline.meanMs;
  const zScore = baseline.stddevMs > 0 ? delta / baseline.stddevMs : 0;
  const absDelta = Math.abs(delta);

  const severity: RegressionSeverity =
    absDelta < thresholds.minimumDeltaMs ? 'none'
      : zScore >= thresholds.regressionZScore ? 'regression'
        : zScore >= thresholds.warningZScore ? 'warning'
          : 'none';

  const message = severity === 'none'
    ? `${baseline.phase}: ${currentMs}ms within baseline (mean=${baseline.meanMs}ms)`
    : severity === 'warning'
      ? `${baseline.phase}: ${currentMs}ms is ${zScore.toFixed(1)}σ above baseline (mean=${baseline.meanMs}ms, p99=${baseline.p99Ms}ms)`
      : `${baseline.phase}: REGRESSION ${currentMs}ms is ${zScore.toFixed(1)}σ above baseline (mean=${baseline.meanMs}ms, p99=${baseline.p99Ms}ms)`;

  return {
    phase: baseline.phase,
    severity,
    currentMs,
    baselineMeanMs: baseline.meanMs,
    baselineStddevMs: baseline.stddevMs,
    zScore: Number(zScore.toFixed(2)),
    message,
  };
}

export function detectAllRegressions(
  baselines: readonly PhaseTimingBaseline[],
  currentTimings: ReadonlyMap<SpeedrunPhase, number>,
  thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS,
): readonly RegressionSignal[] {
  return baselines
    .filter((baseline) => currentTimings.has(baseline.phase))
    .map((baseline) => detectRegression(baseline, currentTimings.get(baseline.phase)!, thresholds));
}

// ─── JSONL sample extraction ───

/** Extract phase timing samples from SpeedrunProgressEvent-shaped objects. */
export function extractTimingSamples(
  events: readonly {
    readonly phase: SpeedrunPhase;
    readonly phaseDurationMs: number | null;
    readonly iteration?: number;
    readonly seed: string;
    readonly wallClockMs: number;
  }[],
): readonly PhaseTimingSample[] {
  return events
    .filter((event): event is typeof event & { readonly phaseDurationMs: number } =>
      event.phaseDurationMs !== null && event.phaseDurationMs !== undefined)
    .map((event): PhaseTimingSample => ({
      phase: event.phase,
      durationMs: event.phaseDurationMs,
      ...(event.iteration !== undefined ? { iteration: event.iteration } : {}),
      seed: event.seed,
      wallClockMs: event.wallClockMs,
    }));
}

// ─── Summary formatting ───

export function formatBaselineSummary(baselines: readonly PhaseTimingBaseline[]): string {
  const lines = baselines.map((b) => {
    const meanSec = (b.meanMs / 1000).toFixed(1);
    const stddevSec = (b.stddevMs / 1000).toFixed(1);
    const p99Sec = (b.p99Ms / 1000).toFixed(1);
    return `  ${b.phase.padEnd(12)} mean=${meanSec}s  σ=${stddevSec}s  p99=${p99Sec}s  n=${b.sampleCount}`;
  });
  return ['Phase Timing Baselines:', ...lines].join('\n');
}

export function formatRegressionReport(signals: readonly RegressionSignal[]): string {
  const regressions = signals.filter((s) => s.severity !== 'none');
  if (regressions.length === 0) {
    return 'No timing regressions detected.';
  }
  return [
    'Timing Regression Report:',
    ...regressions.map((s) => `  [${s.severity.toUpperCase()}] ${s.message}`),
  ].join('\n');
}
