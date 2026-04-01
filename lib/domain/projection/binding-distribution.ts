/**
 * BindingDistribution — pure domain module for step binding classification.
 *
 * During Act 4 (Deterministic Compile), scenario steps are bound to
 * elements via the resolution ladder. Each step falls into one of three
 * categories: bound (confident), deferred (uncertain), or unbound (no match).
 *
 * This module computes:
 *   - Per-scenario binding distribution (stacked bar data)
 *   - Aggregate distribution across all scenarios
 *   - Binding confidence thresholds
 *   - Trend tracking (improving/stable/degrading)
 *
 * The molecule component renders this as a stacked horizontal bar:
 *   ┌──────────────────────┬────────────┬──────┐
 *   │   BOUND (green)      │ DEFERRED   │UNBOUND│
 *   │   72%                │ (amber)20% │(red)8%│
 *   └──────────────────────┴────────────┴──────┘
 *
 * Pure domain logic. No React.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 4), Part VIII
 */

// ─── Types ───

/** Binding classification for a single step. */
export type BindingKind = 'bound' | 'deferred' | 'unbound';

/** A step's binding result. */
export interface StepBinding {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly kind: BindingKind;
  readonly confidence: number;       // [0, 1]
  readonly resolutionRung: number | null; // Rung index if bound
  readonly element: string | null;
  readonly screen: string | null;
}

/** Distribution percentages (always sum to 1.0). */
export interface DistributionBreakdown {
  readonly bound: number;     // [0, 1]
  readonly deferred: number;  // [0, 1]
  readonly unbound: number;   // [0, 1]
}

/** Full distribution state for a scenario. */
export interface ScenarioDistribution {
  readonly adoId: string;
  readonly totalSteps: number;
  readonly boundCount: number;
  readonly deferredCount: number;
  readonly unboundCount: number;
  readonly breakdown: DistributionBreakdown;
  readonly avgConfidence: number;
}

/** Aggregate distribution across all scenarios. */
export interface AggregateDistribution {
  readonly scenarios: readonly ScenarioDistribution[];
  readonly totalSteps: number;
  readonly totalBound: number;
  readonly totalDeferred: number;
  readonly totalUnbound: number;
  readonly breakdown: DistributionBreakdown;
  readonly avgConfidence: number;
  readonly trend: BindingTrend;
}

/** Trend over successive compilations. */
export type BindingTrend = 'improving' | 'stable' | 'degrading';

// ─── Constants ───

export const BINDING_COLORS: Readonly<Record<BindingKind, string>> = {
  bound:    '#22c55e', // Green
  deferred: '#f59e0b', // Amber
  unbound:  '#ef4444', // Red
} as const;

/** Confidence threshold for considering a binding "confident". */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Trend detection threshold (percentage points). */
const TREND_THRESHOLD = 0.03;

// ─── Computation ───

/**
 * Compute distribution breakdown from counts.
 */
export function computeBreakdown(
  bound: number,
  deferred: number,
  unbound: number,
): DistributionBreakdown {
  const total = bound + deferred + unbound;
  if (total === 0) {
    return { bound: 0, deferred: 0, unbound: 0 };
  }
  return {
    bound: bound / total,
    deferred: deferred / total,
    unbound: unbound / total,
  };
}

/**
 * Classify a single step based on binding kind and confidence.
 */
export function classifyStep(
  kind: BindingKind,
  confidence: number,
): BindingKind {
  if (kind === 'bound' && confidence < CONFIDENCE_THRESHOLD) {
    return 'deferred'; // Low-confidence binding is effectively deferred
  }
  return kind;
}

/**
 * Compute distribution for a single scenario from step bindings.
 */
export function computeScenarioDistribution(
  adoId: string,
  bindings: readonly StepBinding[],
): ScenarioDistribution {
  const classified = bindings.map((b) => classifyStep(b.kind, b.confidence));
  const boundCount = classified.filter((k) => k === 'bound').length;
  const deferredCount = classified.filter((k) => k === 'deferred').length;
  const unboundCount = classified.filter((k) => k === 'unbound').length;
  const totalConfidence = bindings.reduce((sum, b) => sum + b.confidence, 0);

  return {
    adoId,
    totalSteps: bindings.length,
    boundCount,
    deferredCount,
    unboundCount,
    breakdown: computeBreakdown(boundCount, deferredCount, unboundCount),
    avgConfidence: bindings.length > 0 ? totalConfidence / bindings.length : 0,
  };
}

/**
 * Compute aggregate distribution from all scenario distributions.
 */
export function computeAggregateDistribution(
  scenarios: readonly ScenarioDistribution[],
  previousBoundRate: number | null = null,
): AggregateDistribution {
  const totalSteps = scenarios.reduce((sum, s) => sum + s.totalSteps, 0);
  const totalBound = scenarios.reduce((sum, s) => sum + s.boundCount, 0);
  const totalDeferred = scenarios.reduce((sum, s) => sum + s.deferredCount, 0);
  const totalUnbound = scenarios.reduce((sum, s) => sum + s.unboundCount, 0);
  const totalConfidence = scenarios.reduce(
    (sum, s) => sum + s.avgConfidence * s.totalSteps, 0,
  );

  const breakdown = computeBreakdown(totalBound, totalDeferred, totalUnbound);
  const avgConfidence = totalSteps > 0 ? totalConfidence / totalSteps : 0;

  // Compute trend
  const trend: BindingTrend = previousBoundRate === null
    ? 'stable'
    : breakdown.bound - previousBoundRate > TREND_THRESHOLD
      ? 'improving'
      : breakdown.bound - previousBoundRate < -TREND_THRESHOLD
        ? 'degrading'
        : 'stable';

  return {
    scenarios,
    totalSteps,
    totalBound,
    totalDeferred,
    totalUnbound,
    breakdown,
    avgConfidence,
    trend,
  };
}

/**
 * Format a breakdown as a display string: "72% bound · 20% deferred · 8% unbound".
 */
export function formatBreakdown(breakdown: DistributionBreakdown): string {
  const bound = Math.round(breakdown.bound * 100);
  const deferred = Math.round(breakdown.deferred * 100);
  const unbound = Math.round(breakdown.unbound * 100);
  return `${bound}% bound · ${deferred}% deferred · ${unbound}% unbound`;
}

/**
 * Get the stacked bar segments for rendering.
 */
export function stackedBarSegments(
  breakdown: DistributionBreakdown,
): readonly { readonly kind: BindingKind; readonly width: number; readonly color: string }[] {
  return [
    { kind: 'bound', width: breakdown.bound, color: BINDING_COLORS.bound },
    { kind: 'deferred', width: breakdown.deferred, color: BINDING_COLORS.deferred },
    { kind: 'unbound', width: breakdown.unbound, color: BINDING_COLORS.unbound },
  ];
}

/**
 * Determine if a scenario has "good" binding (>70% bound).
 */
export function isWellBound(distribution: ScenarioDistribution): boolean {
  return distribution.breakdown.bound >= 0.7;
}

/**
 * Get the trend arrow character.
 */
export function trendArrow(trend: BindingTrend): string {
  switch (trend) {
    case 'improving': return '↑';
    case 'stable':    return '→';
    case 'degrading': return '↓';
  }
}

/**
 * Get the trend color.
 */
export function trendColor(trend: BindingTrend): string {
  switch (trend) {
    case 'improving': return '#22c55e';
    case 'stable':    return '#f59e0b';
    case 'degrading': return '#ef4444';
  }
}
