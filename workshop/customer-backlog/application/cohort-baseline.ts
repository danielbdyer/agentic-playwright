/**
 * Cold-start cohort regression ratchet (Cycle 11 / G2).
 *
 * Praxis audit §G2: receipts are gitignored and baselines under
 * `.tesseract/` are machine-local, so a change that silently
 * regressed TodoMVC from 3/5 to 1/5 failed nothing — the only
 * regression detector was an agent choosing to re-run and compare
 * by hand.
 *
 * This module commits the honest per-AUT numbers IN-REPO (under
 * `workshop/customer-backlog/public-aut/baselines/<aut>.json`,
 * keyed by substrate version) and provides a pure comparator with
 * ratchet semantics:
 *
 *   - recall must not regress:    observed.domTargetMatched ≥ baseline
 *   - verified must not regress:  observed.verifiedMatches  ≥ baseline
 *   - precision must not regress: observed.falsePositives   ≤ baseline
 *
 * An improving run updates the baseline EXPLICITLY (snapshot-test
 * semantics) — recall/verified going up, or false positives going
 * down, is an improvement the operator promotes by committing a new
 * baseline, not something the comparator silently absorbs.
 *
 * Live-network-in-CI is unacceptable (the AUTs are real public
 * sites), so the comparator is the gate the held-out evaluation and
 * any local cohort run consult via `compile-public-aut
 * --check-baseline`; the committed baseline + the structural law are
 * what make a regression detectable at all.
 *
 * Pure domain + a thin fs loader. No Effect imports in the
 * comparator.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Substrate-version-keyed honest summary for one AUT. */
export interface CohortBaseline {
  readonly aut: string;
  readonly substrateVersion: string;
  /** Honest denominator (G4): DOM-targeting steps only. */
  readonly domTargetSteps: number;
  /** Honest numerator: real DOM matches. */
  readonly domTargetMatched: number;
  /** Semantic-correctness verified matches (cycle 8). */
  readonly verifiedMatches: number;
  /** False positives (matched the wrong element). */
  readonly falsePositives: number;
  /** When this baseline was last promoted, and why. Provenance for
   *  the snapshot-update discipline. */
  readonly capturedAt: string;
  readonly note: string;
}

/** The observed numbers a cohort run produces, in the shape the
 *  comparator needs. A subset of the CLI summary. */
export interface CohortObservation {
  readonly aut: string;
  readonly substrateVersion: string;
  readonly domTargetSteps: number;
  readonly domTargetMatched: number;
  readonly verifiedMatches: number;
  readonly falsePositives: number;
}

export interface BaselineComparison {
  /** True iff no ratchet axis regressed. */
  readonly ok: boolean;
  /** Human-legible regression descriptions; empty when ok. */
  readonly regressions: readonly string[];
  /** Human-legible improvements worth promoting into the baseline. */
  readonly improvements: readonly string[];
  /** True when the substrate version moved — the comparison is
   *  cross-version and the ratchet does NOT apply (a major bump can
   *  legitimately disagree; the operator must re-baseline). */
  readonly substrateVersionMismatch: boolean;
}

/**
 * Pure ratchet comparator. When the substrate version moved, the
 * comparison is informational only (substrateVersionMismatch=true,
 * ok=true) — a substrate bump can legitimately change outcomes, so
 * the ratchet is scoped to a fixed substrate version per
 * docs/v2-probe-ir-spike.md §8.6.
 */
export function compareToBaseline(
  baseline: CohortBaseline,
  observed: CohortObservation,
): BaselineComparison {
  if (baseline.substrateVersion !== observed.substrateVersion) {
    return {
      ok: true,
      regressions: [],
      improvements: [
        `substrate version moved ${baseline.substrateVersion} → ${observed.substrateVersion}; ratchet not applied — re-baseline ${observed.aut} explicitly`,
      ],
      substrateVersionMismatch: true,
    };
  }

  const regressions: string[] = [];
  const improvements: string[] = [];

  if (observed.domTargetMatched < baseline.domTargetMatched) {
    regressions.push(
      `recall regressed: domTargetMatched ${observed.domTargetMatched} < baseline ${baseline.domTargetMatched}`,
    );
  } else if (observed.domTargetMatched > baseline.domTargetMatched) {
    improvements.push(
      `recall improved: domTargetMatched ${observed.domTargetMatched} > baseline ${baseline.domTargetMatched}`,
    );
  }

  if (observed.verifiedMatches < baseline.verifiedMatches) {
    regressions.push(
      `verified regressed: verifiedMatches ${observed.verifiedMatches} < baseline ${baseline.verifiedMatches}`,
    );
  } else if (observed.verifiedMatches > baseline.verifiedMatches) {
    improvements.push(
      `verified improved: verifiedMatches ${observed.verifiedMatches} > baseline ${baseline.verifiedMatches}`,
    );
  }

  if (observed.falsePositives > baseline.falsePositives) {
    regressions.push(
      `precision regressed: falsePositives ${observed.falsePositives} > baseline ${baseline.falsePositives}`,
    );
  } else if (observed.falsePositives < baseline.falsePositives) {
    improvements.push(
      `precision improved: falsePositives ${observed.falsePositives} < baseline ${baseline.falsePositives}`,
    );
  }

  return {
    ok: regressions.length === 0,
    regressions,
    improvements,
    substrateVersionMismatch: false,
  };
}

const BASELINES_DIR_RELATIVE = path.join(
  'workshop',
  'customer-backlog',
  'public-aut',
  'baselines',
);

export function baselinePath(rootDir: string, aut: string): string {
  return path.join(rootDir, BASELINES_DIR_RELATIVE, `${aut}.json`);
}

/** Load the committed baseline for an AUT, or null when none is
 *  committed yet (a never-baselined AUT cannot regress). */
export function loadCohortBaseline(rootDir: string, aut: string): CohortBaseline | null {
  const file = baselinePath(rootDir, aut);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as CohortBaseline;
}

/** List every committed baseline (for the structural law). */
export function loadAllCohortBaselines(rootDir: string): readonly CohortBaseline[] {
  const dir = path.join(rootDir, BASELINES_DIR_RELATIVE);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as CohortBaseline);
}
