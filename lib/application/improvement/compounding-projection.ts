/**
 * Compounding projection — bridges scorecard history to the pure
 * `compounding.ts` cohort-trajectory measurement module.
 *
 * Pure projection. Given:
 *   - a `ScorecardHistoryEntry[]` (the chronological scoreboard)
 *   - a `CohortKey` for the current cohort
 *   - a metric extractor (which numeric field to track across history)
 *
 * Produces a `CompoundingTrajectory` filtered to entries comparable to
 * the current cohort, with maturity drawn from each entry's
 * `memoryMaturity` field. Entries lacking `memoryMaturity` are dropped
 * (they predate the maturity field and cannot anchor a trajectory).
 *
 * Today's history entries do NOT carry an embedded cohort key — that
 * would be a bigger schema change. Instead, the projection accepts an
 * optional `cohortKeyFor` resolver that the caller can supply when it
 * has cohort context (e.g. from the experiment registry). When no
 * resolver is provided, ALL history entries are treated as a single
 * implicit cohort, which is the conservative default for the early
 * dogfood corpus where every run is on the same substrate.
 */

import {
  type CohortKey,
  comparable,
} from '../../domain/fitness/cohort';
import {
  type CompoundingSample,
  type CompoundingTrajectory,
} from '../../domain/fitness/compounding';
import type { ScorecardHistoryEntry } from '../../domain/fitness/types';

export interface CompoundingProjectionOptions {
  readonly history: readonly ScorecardHistoryEntry[];
  readonly currentCohort?: CohortKey | undefined;
  readonly cohortKeyFor?: ((entry: ScorecardHistoryEntry) => CohortKey | null) | undefined;
  readonly extractValue: (entry: ScorecardHistoryEntry) => number | undefined;
  readonly direction: 'higher-is-better' | 'lower-is-better';
}

export function projectCompoundingTrajectory(options: CompoundingProjectionOptions): CompoundingTrajectory {
  const samples: CompoundingSample[] = [];
  for (const entry of options.history) {
    const maturity = entry.memoryMaturity;
    if (maturity === undefined) continue;
    if (options.currentCohort && options.cohortKeyFor) {
      const entryKey = options.cohortKeyFor(entry);
      if (!entryKey || !comparable(entryKey, options.currentCohort)) continue;
    }
    const value = options.extractValue(entry);
    if (value === undefined || Number.isNaN(value)) continue;
    samples.push({
      maturity,
      value,
      observedAt: entry.runAt,
    });
  }
  // Sort by maturity ascending so the slope direction is well-defined
  // even when history was emitted out of order.
  const sorted = [...samples].sort((left, right) => left.maturity - right.maturity);
  return {
    samples: sorted,
    direction: options.direction,
  };
}
