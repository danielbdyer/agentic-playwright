/**
 * CompoundingScoreboard — the top-level read-model aggregate.
 *
 * Per docs/v2-compounding-engine-plan.md §3.7, the scoreboard is
 * the single artifact the engine emits per cycle. Consumers:
 *
 *   - `tesseract compounding scoreboard` — prints it as JSON.
 *   - `tesseract compounding improve`    — reads gaps + graduation.
 *   - Dashboard projection (Z10)         — renders it read-only.
 *
 * Scoreboards are content-addressed; the snapshot store (Z7)
 * persists them as `workshop/logs/scoreboard-snapshots/<fp>.json`.
 * Each scoreboard's `lastRegression` references the prior snapshot.
 *
 * Value-object discipline: every field readonly; constructed fresh.
 * No Effect imports.
 */

import type { GapReport } from './gap-analysis';
import type { GraduationGateReport } from './graduation';
import type { RegressionReport } from './regression';
import type { Trajectory } from './trajectory';

export interface CompoundingScoreboard {
  /** ISO-8601 of scoreboard computation. */
  readonly generatedAt: string;
  /** Fraction [0, 1] of the manifest's probeable surface currently
   *  covered by a passing probe receipt. */
  readonly probeCoverageRatio: number;
  /** Fraction [0, 1] of the scenario corpus currently passing. */
  readonly scenarioPassRatio: number;
  /** Per-cohort trajectories for every hypothesis cohort the
   *  ledger tracks. */
  readonly trajectories: readonly Trajectory[];
  /** Count of currently-active (non-retired) ratchets. */
  readonly activeRatchetCount: number;
  /** Count of ratchets that are currently broken (scenario
   *  failing). */
  readonly brokenRatchetCount: number;
  readonly graduation: GraduationGateReport;
  readonly gaps: GapReport;
  /** The diff against the most-recent-prior snapshot. Null for
   *  the first-ever scoreboard (no baseline available). */
  readonly lastRegression: RegressionReport | null;
  readonly substrateVersion: string;
}
