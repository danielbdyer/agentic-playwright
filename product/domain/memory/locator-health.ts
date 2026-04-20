/**
 * Locator strategy health — the per-strategy reliability score
 * that co-locates on the facet record (not on a separate
 * `SelectorHealthIndex` as v1 carried it).
 *
 * Per `docs/v2-direction.md §6 Step 3`, locator health is a
 * property of the facet's locator strategies, not a parallel
 * structure. The co-location forces the seam: a write to the
 * facet is the only way to update its health.
 *
 * Pure domain — no Effect, no IO.
 */

/** The ordered locator-strategy rungs the observation ladder walks.
 *  v2 flips the v1 order: role-first, test-id falls to rung 5. The
 *  enum stays stable; the ladder ORDER is a configuration concern
 *  under `product/runtime/observe/`. */
export type LocatorStrategyKind =
  | 'role'
  | 'label'
  | 'placeholder'
  | 'text'
  | 'test-id'
  | 'css';

/** Aggregate outcome for one strategy across the runs that tried
 *  it. Computed from the evidence log and cached on-write; re-
 *  derived when the log grows. */
export interface LocatorStrategyHealth {
  /** Which strategy this health record is for. */
  readonly kind: LocatorStrategyKind;
  /** Number of attempts recorded. Increases monotonically as runs
   *  accumulate. */
  readonly attempts: number;
  /** Attempts that resolved successfully (found the element, not
   *  necessarily passed the step's assertion). */
  readonly successes: number;
  /** Success rate = successes / attempts, or 0 when attempts is 0. */
  readonly successRate: number;
  /** Flakiness score: 0 when deterministic (always success OR
   *  always fail), 1 when maximally unstable (50/50 split).
   *  Computed as `4 * rate * (1 - rate)`. */
  readonly flakiness: number;
  /** Direction over the last N attempts. `'improving'` when the
   *  rolling window's success rate is trending up; `'degrading'`
   *  when trending down; `'stable'` otherwise. */
  readonly trend: 'improving' | 'stable' | 'degrading';
  /** ISO-8601 timestamp of the most recent attempt feeding this
   *  aggregate. */
  readonly lastSampledAt: string | null;
}

/** Empty baseline for a strategy that has never been attempted. */
export function emptyStrategyHealth(kind: LocatorStrategyKind): LocatorStrategyHealth {
  return {
    kind,
    attempts: 0,
    successes: 0,
    successRate: 0,
    flakiness: 0,
    trend: 'stable',
    lastSampledAt: null,
  };
}

/** Pure health computation from attempt counts. Does not look at
 *  trend — callers compute trend from a longer history and merge. */
export function healthFromCounts(
  kind: LocatorStrategyKind,
  attempts: number,
  successes: number,
  lastSampledAt: string | null,
): LocatorStrategyHealth {
  if (attempts < 0 || successes < 0) {
    throw new Error(`healthFromCounts: attempts (${attempts}) and successes (${successes}) must be non-negative`);
  }
  if (successes > attempts) {
    throw new Error(`healthFromCounts: successes (${successes}) cannot exceed attempts (${attempts})`);
  }
  const rate = attempts === 0 ? 0 : successes / attempts;
  const flakiness = 4 * rate * (1 - rate);
  return {
    kind,
    attempts,
    successes,
    successRate: rate,
    flakiness,
    trend: 'stable',
    lastSampledAt,
  };
}

/** A single locator-strategy entry on a facet record. Pairs the
 *  literal locator expression (the string Playwright hands to the
 *  ladder) with its running health aggregate. */
export interface LocatorStrategyEntry {
  /** Which rung of the ladder. Determines the builder used by the
   *  runtime to form the Playwright locator. */
  readonly kind: LocatorStrategyKind;
  /** Rung-specific expression. The runtime interprets this:
   *  `role` → role name; `label` → label text; etc. */
  readonly expression: string;
  /** Per-strategy health. Updated on each run via the
   *  `locator-health-track` verb. */
  readonly health: LocatorStrategyHealth;
}
