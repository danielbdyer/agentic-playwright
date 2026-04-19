/**
 * Alignment targets — typed numeric goals from `docs/alignment-targets.md`.
 *
 * Pure domain — no Effect, no IO. The application layer reads these
 * targets in `compareToScorecard` to apply the Phase 3.2 veto:
 * improvement is rejected when any target metric regresses below its
 * current-window floor, regardless of Pareto outcome.
 *
 * The rules:
 *   - C6 hit rate: monotonic up, floor 60% by 2026-Q3
 *   - M5 ratio: monotonic up, floor 1.2 by 2026-Q3
 *   - effectiveHitRate: floor 0.4 (critical threshold)
 *   - per-theorem-group floors: K and S are at proxy by Q2
 */

export type TargetDirection = 'higher-is-better' | 'lower-is-better';

export type TargetSeverity = 'floor' | 'critical-floor' | 'soft';

export interface MetricTarget {
  readonly metric: TargetMetricName;
  readonly floor: number;
  readonly direction: TargetDirection;
  readonly severity: TargetSeverity;
  /** ISO date by which the floor must be met. Optional. */
  readonly deadline?: string;
  readonly rationale: string;
}

/** Names of metrics tracked by `MetricTarget`. */
export type TargetMetricName =
  | 'effectiveHitRate'
  | 'knowledgeHitRate'
  | 'ambiguityRate'
  | 'suspensionRate'
  | 'degradedLocatorRate'
  | 'proposalYield'
  | 'recoverySuccessRate'
  | 'm5Ratio'
  | 'c6HitRate';

/**
 * The wall-mounted scoreboard. Floors here are the Phase 3.2 veto
 * gates: any regression below floor blocks scorecard improvement
 * acceptance regardless of Pareto outcome.
 */
export const ALIGNMENT_TARGETS: readonly MetricTarget[] = [
  {
    metric: 'effectiveHitRate',
    floor: 0.4,
    direction: 'higher-is-better',
    severity: 'critical-floor',
    rationale: 'Below 0.4 the substrate is failing more than it succeeds. Critical floor.',
  },
  {
    metric: 'm5Ratio',
    floor: 1.0,
    direction: 'higher-is-better',
    severity: 'floor',
    deadline: '2026-Q2',
    rationale: 'Memory worthiness must be > 1 — remembering must beat forgetting economically.',
  },
  {
    metric: 'c6HitRate',
    floor: 0.5,
    direction: 'higher-is-better',
    severity: 'floor',
    deadline: '2026-Q2',
    rationale: 'Half of accepted augmentations must move the needle in the region they attached to.',
  },
  {
    metric: 'ambiguityRate',
    floor: 0.4,
    direction: 'lower-is-better',
    severity: 'soft',
    rationale: 'Above 0.4, ambiguity dominates and proposals cannot stabilize.',
  },
  {
    metric: 'suspensionRate',
    floor: 0.3,
    direction: 'lower-is-better',
    severity: 'soft',
    rationale: 'Above 0.3, the loop is producing more handoffs than it can resolve.',
  },
  {
    metric: 'degradedLocatorRate',
    floor: 0.3,
    direction: 'lower-is-better',
    severity: 'soft',
    rationale: 'Above 0.3, locator degradation is the dominant failure mode.',
  },
  {
    metric: 'proposalYield',
    floor: 0.6,
    direction: 'higher-is-better',
    severity: 'soft',
    rationale: 'Below 0.6, more than 40% of proposals are blocked or invalid.',
  },
  {
    metric: 'recoverySuccessRate',
    floor: 0.7,
    direction: 'higher-is-better',
    severity: 'soft',
    rationale: 'Below 0.7, recovery strategies are not earning their cost.',
  },
] as const;

// ─── Pure target check ─────────────────────────────────────────────

export type TargetVerdict = 'meeting' | 'below-floor' | 'unknown';

/** Pure target check. Returns 'unknown' when the value is undefined. */
export function checkTarget(target: MetricTarget, value: number | undefined): TargetVerdict {
  if (value === undefined || Number.isNaN(value)) return 'unknown';
  if (target.direction === 'higher-is-better') {
    return value >= target.floor ? 'meeting' : 'below-floor';
  }
  return value <= target.floor ? 'meeting' : 'below-floor';
}

/**
 * Apply ALL targets to a metrics record. Pure. Returns the list of
 * targets that are below floor — empty when everything is meeting
 * or unknown.
 */
export function violatedFloors(
  metrics: Partial<Record<TargetMetricName, number>>,
): readonly MetricTarget[] {
  return ALIGNMENT_TARGETS.filter((target) => checkTarget(target, metrics[target.metric]) === 'below-floor');
}

/**
 * Veto check: returns true iff any critical-floor target is below
 * floor. Critical-floor violations are the only ones that block
 * acceptance regardless of Pareto outcome; soft and regular floors
 * surface as warnings.
 */
export function hasCriticalFloorViolation(
  metrics: Partial<Record<TargetMetricName, number>>,
): boolean {
  return ALIGNMENT_TARGETS.some(
    (target) => target.severity === 'critical-floor' && checkTarget(target, metrics[target.metric]) === 'below-floor',
  );
}

/**
 * All target metrics on the wall, in declaration order.
 * Useful for dashboards that want to render the floor table.
 */
export function targetsByMetric(): Readonly<Record<TargetMetricName, MetricTarget>> {
  return Object.fromEntries(ALIGNMENT_TARGETS.map((t) => [t.metric, t])) as Record<TargetMetricName, MetricTarget>;
}
