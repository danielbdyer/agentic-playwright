/**
 * Execution Coherence Report — correlates four runtime signal dimensions
 * (rung drift, timing regression, cost anomaly, console noise) into a
 * unified per-screen health view.
 *
 * Today these four modules produce independent diagnostics:
 * - rung-drift.ts → RungDriftReport (per-intent rung degradation)
 * - timing-baseline.ts → TimingRegressionReport (per-step timing regressions)
 * - execution-cost.ts → CostAnomalyReport (cost anomalies)
 * - console-intelligence.ts → ConsolePatternIndex (error patterns)
 *
 * Nobody asks:
 * - Do steps with rung drift also exhibit timing regression?
 * - Are high-cost steps also noisy?
 * - Which screens manifest multiple signal types simultaneously?
 * - What's the per-screen composite health score?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { LearningState } from '../learning/learning-state';

// ─── Types ───

export interface ScreenHealthProfile {
  readonly screen: string;
  readonly rungDriftScore: number;
  readonly timingScore: number;
  readonly costScore: number;
  readonly consoleScore: number;
  readonly compositeScore: number;
  readonly signalCount: number;
}

export interface SignalCorrelation {
  readonly signalA: string;
  readonly signalB: string;
  readonly coOccurrenceRate: number;
  readonly strength: number;
}

export interface ExecutionCoherenceReport {
  readonly kind: 'execution-coherence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly screenHealth: readonly ScreenHealthProfile[];
  readonly signalCorrelations: readonly SignalCorrelation[];
  readonly compositeHealthScore: number;
  readonly hotScreens: readonly string[];
}

// ─── Screen extraction helpers ───

/**
 * Extract a screen name from a category/intent reference.
 * Categories are formatted as "WidgetType:action" or "screen.element:action".
 * Intent refs may contain "Screen.Element" patterns.
 */
function extractScreen(ref: string): string {
  // "OsButton:click" → "OsButton", "PolicySearch.Number:fill" → "PolicySearch"
  const colonParts = ref.split(':');
  const beforeColon = colonParts[0] ?? ref;
  const dotParts = beforeColon.split('.');
  return dotParts[0] ?? beforeColon;
}

// ─── Per-screen signal aggregation ───

interface ScreenSignals {
  rungDriftCount: number;
  rungDriftTotal: number;
  timingRegressionCount: number;
  timingTotal: number;
  costAnomalyCount: number;
  costTotal: number;
  consoleCorrelatedCount: number;
  consoleTotal: number;
}

function emptySignals(): ScreenSignals {
  return {
    rungDriftCount: 0, rungDriftTotal: 0,
    timingRegressionCount: 0, timingTotal: 0,
    costAnomalyCount: 0, costTotal: 0,
    consoleCorrelatedCount: 0, consoleTotal: 0,
  };
}

function getOrCreate(map: Map<string, ScreenSignals>, screen: string): ScreenSignals {
  const existing = map.get(screen);
  if (existing) return existing;
  const signals = emptySignals();
  map.set(screen, signals);
  return signals;
}

/**
 * Aggregate per-screen signals from the LearningState's indices.
 */
function aggregateScreenSignals(state: LearningState): Map<string, ScreenSignals> {
  const screens = new Map<string, ScreenSignals>();

  // Rung drift: entries with driftDirection === 'degrading'
  for (const entry of state.rungDrift.entries) {
    const screen = extractScreen(entry.intentRef);
    const signals = getOrCreate(screens, screen);
    signals.rungDriftTotal += 1;
    if (entry.driftDirection === 'degrading') {
      signals.rungDriftCount += 1;
    }
  }

  // Timing regressions: from the signals
  for (const regression of state.signals.timingRegressions) {
    const screen = extractScreen(regression.stepCategory);
    const signals = getOrCreate(screens, screen);
    signals.timingRegressionCount += 1;
    signals.timingTotal += 1;
  }

  // Cost anomalies: from the signals
  for (const anomaly of state.signals.costAnomalies) {
    const screen = extractScreen(anomaly.category);
    const signals = getOrCreate(screens, screen);
    signals.costAnomalyCount += 1;
    signals.costTotal += 1;
  }

  // Console noise: patterns with high failure correlation
  for (const pattern of state.signals.noisyConsolePatterns) {
    // Console patterns are global, not screen-scoped — attribute to a synthetic "global" screen
    const screen = 'global';
    const signals = getOrCreate(screens, screen);
    signals.consoleCorrelatedCount += 1;
    signals.consoleTotal += 1;
  }

  return screens;
}

// ─── Health profile computation ───

function computeHealthProfile(screen: string, signals: ScreenSignals): ScreenHealthProfile {
  // Each score is 1.0 (healthy) when no issues, 0.0 when all signals are problems
  const rungDriftScore = signals.rungDriftTotal > 0
    ? 1 - signals.rungDriftCount / signals.rungDriftTotal
    : 1;

  // For timing/cost/console, having any issue degrades the score
  const timingScore = signals.timingTotal > 0
    ? Math.max(0, 1 - signals.timingRegressionCount / Math.max(signals.timingTotal, 1))
    : 1;

  const costScore = signals.costTotal > 0
    ? Math.max(0, 1 - signals.costAnomalyCount / Math.max(signals.costTotal, 1))
    : 1;

  const consoleScore = signals.consoleTotal > 0
    ? Math.max(0, 1 - signals.consoleCorrelatedCount / Math.max(signals.consoleTotal, 1))
    : 1;

  // Count how many signal types have issues
  let signalCount = 0;
  if (signals.rungDriftCount > 0) signalCount += 1;
  if (signals.timingRegressionCount > 0) signalCount += 1;
  if (signals.costAnomalyCount > 0) signalCount += 1;
  if (signals.consoleCorrelatedCount > 0) signalCount += 1;

  const compositeScore = (
    rungDriftScore * 0.3 +
    timingScore * 0.25 +
    costScore * 0.25 +
    consoleScore * 0.2
  );

  return {
    screen,
    rungDriftScore,
    timingScore,
    costScore,
    consoleScore,
    compositeScore,
    signalCount,
  };
}

// ─── Signal correlation ───

/**
 * Compute pairwise signal correlations: for each pair of signal types,
 * what fraction of screens that have signal A also have signal B?
 */
function computeSignalCorrelations(
  profiles: readonly ScreenHealthProfile[],
): readonly SignalCorrelation[] {
  const signalNames = ['rungDrift', 'timing', 'cost', 'console'] as const;
  const signalScoreKey: Record<string, keyof ScreenHealthProfile> = {
    rungDrift: 'rungDriftScore',
    timing: 'timingScore',
    cost: 'costScore',
    console: 'consoleScore',
  };

  const correlations: SignalCorrelation[] = [];

  for (let i = 0; i < signalNames.length; i++) {
    for (let j = i + 1; j < signalNames.length; j++) {
      const a = signalNames[i]!;
      const b = signalNames[j]!;
      const keyA = signalScoreKey[a]!;
      const keyB = signalScoreKey[b]!;

      // Count screens where both signals are degraded (< 1.0)
      const degradedA = profiles.filter((p) => (p[keyA] as number) < 1);
      const bothDegraded = degradedA.filter((p) => (p[keyB] as number) < 1);

      const coOccurrenceRate = degradedA.length > 0
        ? bothDegraded.length / degradedA.length
        : 0;

      // Strength: how often A and B co-occur relative to total screens
      const strength = profiles.length > 0
        ? bothDegraded.length / profiles.length
        : 0;

      correlations.push({
        signalA: a,
        signalB: b,
        coOccurrenceRate,
        strength,
      });
    }
  }

  return correlations.sort((a, b) => b.strength - a.strength);
}

// ─── Main orchestration ───

export interface ExecutionCoherenceInput {
  readonly learningState: LearningState;
  readonly generatedAt?: string;
}

/**
 * Build an execution coherence report from a LearningState.
 * Correlates four runtime signal dimensions per-screen.
 *
 * Pure function: learning state → coherence report.
 */
export function buildExecutionCoherence(
  input: ExecutionCoherenceInput,
): ExecutionCoherenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Aggregate per-screen signals
  const screenSignals = aggregateScreenSignals(input.learningState);

  // 2. Compute health profiles
  const screenHealth = [...screenSignals.entries()]
    .map(([screen, signals]) => computeHealthProfile(screen, signals))
    .sort((a, b) => a.compositeScore - b.compositeScore);

  // 3. Compute signal correlations
  const signalCorrelations = computeSignalCorrelations(screenHealth);

  // 4. Identify hot screens (multiple degraded signals)
  const hotScreens = screenHealth
    .filter((p) => p.signalCount >= 2)
    .map((p) => p.screen);

  // 5. Composite health score: average of all screen composites
  const compositeHealthScore = screenHealth.length > 0
    ? screenHealth.reduce((sum, p) => sum + p.compositeScore, 0) / screenHealth.length
    : 1;

  return {
    kind: 'execution-coherence-report',
    version: 1,
    generatedAt,
    screenHealth,
    signalCorrelations,
    compositeHealthScore,
    hotScreens,
  };
}

/**
 * Extract the screens with the worst composite health, sorted ascending.
 */
export function extractHotScreens(
  report: ExecutionCoherenceReport,
  n: number = 5,
): readonly ScreenHealthProfile[] {
  return report.screenHealth.slice(0, n);
}

/**
 * Find signal pairs with strongest co-occurrence.
 */
export function extractStrongestCorrelations(
  report: ExecutionCoherenceReport,
  n: number = 3,
): readonly SignalCorrelation[] {
  return report.signalCorrelations.slice(0, n);
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Execution coherence as ObservationCollapse<R,O,A,S>:
//   R = LearningState (the input)
//   O = ScreenHealthProfile (extracted per-screen health)
//   A = ExecutionCoherenceReport (the aggregate report)
//   S = number (composite health score)

import type { ObservationCollapse } from '../../domain/kernel/observation-collapse';

export const executionCoherenceCollapse: ObservationCollapse<
  ExecutionCoherenceInput,
  ScreenHealthProfile,
  ExecutionCoherenceReport,
  number
> = {
  extract: (inputs) => {
    // Extract screen health profiles from each input's learning state
    return inputs.flatMap((input) => {
      const screenSignals = aggregateScreenSignals(input.learningState);
      return [...screenSignals.entries()].map(([screen, signals]) =>
        computeHealthProfile(screen, signals),
      );
    });
  },
  aggregate: (profiles, _prior) => {
    const sorted = [...profiles].sort((a, b) => a.compositeScore - b.compositeScore);
    const correlations = computeSignalCorrelations(sorted);
    const hotScreens = sorted.filter((p) => p.signalCount >= 2).map((p) => p.screen);
    const compositeHealthScore = sorted.length > 0
      ? sorted.reduce((sum, p) => sum + p.compositeScore, 0) / sorted.length
      : 1;

    return {
      kind: 'execution-coherence-report',
      version: 1,
      generatedAt: new Date().toISOString(),
      screenHealth: sorted,
      signalCorrelations: correlations,
      compositeHealthScore,
      hotScreens,
    };
  },
  signal: (report) => report.compositeHealthScore,
};
