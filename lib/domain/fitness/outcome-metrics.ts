/**
 * Outcome-predictive metrics — the load-bearing signals that answer
 * "will this repository succeed at its intent over time?" rather than
 * "is the framework operationally sound right now?"
 *
 * These metrics are the honest answer to the user's question:
 *   > "Do these metrics actually tell you how successful the repository
 *      will be at its outcome over time? That is what I am most
 *      interested about, above all."
 *
 * The existing runtime obligations (fitness.ts) measure the framework's
 * *preconditions* — is the ladder firing, is the schema honest, is the
 * compiler deterministic. Those are necessary but never sufficient.
 *
 * This module adds the first two *outcome-predictive* metrics:
 *
 *   - **OID (Operator Intervention Density)** — operator decisions per
 *     scenario per iteration. A decreasing curve over a growing corpus
 *     is the operator-leverage signal. A flat curve means the operator
 *     is on a treadmill and the substrate isn't earning its keep.
 *
 *   - **SSS (Scenario Stability Score)** — fraction of previously-green
 *     scenarios that still resolve green at the same or better rung.
 *     A shrinking SSS means knowledge is silently being displaced —
 *     the single biggest blind spot in point-in-time metrics.
 *
 * Both carry `measurementClass: 'direct'` because they are structural
 * projections over real history, not heuristic risk scores derived
 * from single-frame fitness rates.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { LogicalProofObligation, ScorecardHistoryEntry } from './types';

// ─── OID (Operator Intervention Density) ──────────────────────────

/** One row of OID history: a single iteration's operator-decision count
 *  and the corresponding scenario count. */
export interface OIDSample {
  readonly runAt: string;
  readonly operatorDecisions: number;
  readonly scenarioCount: number;
  readonly iterationCount: number;
  /** Derived: decisions per scenario-iteration, in [0, ∞). */
  readonly density: number;
}

/** Extended `ScorecardHistoryEntry` with operator-decision accounting.
 *  The application layer populates these fields when it writes history. */
export interface OutcomeHistoryEntry extends ScorecardHistoryEntry {
  readonly operatorDecisions?: number;
  readonly scenarioCount?: number;
  readonly iterationCount?: number;
  /** Per-scenario stability: { scenarioId: winningRungIndex } — records
   *  which rung each scenario resolved at in this run. Used by SSS. */
  readonly scenarioRungs?: Readonly<Record<string, number>>;
}

/** Compute the OID trajectory from history entries. Pure. */
export function oidTrajectory(history: readonly OutcomeHistoryEntry[]): readonly OIDSample[] {
  return history
    .filter((entry) => entry.operatorDecisions !== undefined && entry.scenarioCount !== undefined)
    .map((entry) => {
      const scenarioCount = entry.scenarioCount!;
      const iterationCount = entry.iterationCount ?? 1;
      const denominator = Math.max(scenarioCount * iterationCount, 1);
      return {
        runAt: entry.runAt,
        operatorDecisions: entry.operatorDecisions!,
        scenarioCount,
        iterationCount,
        density: entry.operatorDecisions! / denominator,
      };
    });
}

/**
 * Build the OID obligation from scorecard history. Pure.
 *
 * Semantics:
 *   - `direct` when ≥3 history samples (enough to fit a trend)
 *   - `healthy` when the OID slope is ≤ 0 (decreasing or flat — operator
 *     leverage is stable or growing)
 *   - `watch` when slope > 0 but < 0.1/iteration (density is drifting up)
 *   - `critical` when slope ≥ 0.1/iteration (operator treadmill)
 *
 * Floor (from alignment-targets): the target is a *strictly decreasing*
 * OID curve over any 4-run window. Flat is acceptable; rising is a
 * failure signal.
 */
export function oidObligation(history: readonly OutcomeHistoryEntry[]): LogicalProofObligation {
  const samples = oidTrajectory(history);
  if (samples.length < 2) {
    return {
      obligation: 'operator-intervention-density',
      propertyRefs: ['A', 'M'],
      score: 0.5,
      status: 'watch',
      evidence: `operator-intervention-density: ${samples.length} sample(s) — insufficient for trend (need ≥2).`,
      measurementClass: samples.length === 0 ? 'derived' : 'heuristic-proxy',
    };
  }
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const slope = (last.density - first.density) / Math.max(samples.length - 1, 1);
  const direction = slope < -0.01 ? 'decreasing' : slope > 0.01 ? 'increasing' : 'flat';
  const status: LogicalProofObligation['status'] =
    slope >= 0.1 ? 'critical' : slope > 0.01 ? 'watch' : 'healthy';
  const score = Number(Math.max(0, Math.min(1, 1 - Math.max(0, slope * 5))).toFixed(4));
  return {
    obligation: 'operator-intervention-density',
    propertyRefs: ['A', 'M'],
    score,
    status,
    evidence: `operator-intervention-density: ${samples.length} samples, first=${first.density.toFixed(3)}, last=${last.density.toFixed(3)}, slope=${slope.toFixed(4)}, direction=${direction}`,
    measurementClass: samples.length >= 3 ? 'direct' : 'heuristic-proxy',
  };
}

// ─── SSS (Scenario Stability Score) ───────────────────────────────

/**
 * For each scenario that was EVER green in the history, what fraction
 * of subsequent runs still see it green at the same or better rung?
 * A decreasing SSS is the single biggest silent-rot signal.
 *
 * Pure. Takes history + the current per-scenario rung map.
 */
export function scenarioStabilityScore(history: readonly OutcomeHistoryEntry[]): number {
  if (history.length < 2) return 1;

  // For each scenario, record the BEST (lowest-index) rung it has ever
  // resolved at, and the most recent rung it resolved at.
  const bestRung = new Map<string, number>();
  const latestRung = new Map<string, number>();
  for (const entry of history) {
    const rungs = entry.scenarioRungs ?? {};
    for (const [scenarioId, rungIndex] of Object.entries(rungs)) {
      const prevBest = bestRung.get(scenarioId);
      if (prevBest === undefined || rungIndex < prevBest) {
        bestRung.set(scenarioId, rungIndex);
      }
      latestRung.set(scenarioId, rungIndex);
    }
  }

  if (bestRung.size === 0) return 1;

  // Pure reduce: functional accumulator over (best, latest) pairs.
  const { stable, total } = [...bestRung.entries()].reduce<{ stable: number; total: number }>(
    (acc, [scenarioId, best]) => {
      const latest = latestRung.get(scenarioId);
      if (latest === undefined) return acc;
      return {
        stable: acc.stable + (latest <= best ? 1 : 0),
        total: acc.total + 1,
      };
    },
    { stable: 0, total: 0 },
  );
  return total === 0 ? 1 : stable / total;
}

/** Build the SSS obligation. Pure. */
export function sssObligation(history: readonly OutcomeHistoryEntry[]): LogicalProofObligation {
  // Count how many history entries contain scenarioRungs data — the
  // measurement class depends on how many real observations we have.
  const annotated = history.filter((e) => e.scenarioRungs !== undefined && Object.keys(e.scenarioRungs).length > 0);
  if (annotated.length < 2) {
    return {
      obligation: 'scenario-stability-score',
      propertyRefs: ['R', 'M'],
      score: 1,
      status: 'healthy',
      evidence: `scenario-stability-score: ${annotated.length} annotated run(s) — insufficient to detect silent regression (need ≥2).`,
      measurementClass: annotated.length === 0 ? 'derived' : 'heuristic-proxy',
    };
  }
  const score = scenarioStabilityScore(annotated);
  const status: LogicalProofObligation['status'] =
    score < 0.8 ? 'critical' : score < 0.95 ? 'watch' : 'healthy';
  return {
    obligation: 'scenario-stability-score',
    propertyRefs: ['R', 'M'],
    score: Number(score.toFixed(4)),
    status,
    evidence: `scenario-stability-score: ${Math.round(score * 100)}% of previously-green scenarios still resolve at their best rung or better across ${annotated.length} annotated runs.`,
    measurementClass: annotated.length >= 3 ? 'direct' : 'heuristic-proxy',
  };
}
