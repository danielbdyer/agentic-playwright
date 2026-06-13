/**
 * `tesseract compile-public-aut` — Floor A.5 cohort runner.
 *
 * Walks the public-AUT cohort manifest at
 * workshop/customer-backlog/public-aut/cohort.json and, for each
 * case, runs the heuristic intent classifier per step and probes
 * the real AUT's DOM for each classified step's role + name.
 * Emits a per-case JSON receipt under
 * workshop/logs/public-aut-receipts/<aut-name>/.
 *
 * This is not the full compile pipeline. It exists to surface
 * real not-found handoffs against real AUTs using only the
 * current generic-tier matchers (role + name) — i.e., to
 * generate the cohort's first real-handoff log without waiting
 * on Z11d's live reasoning adapter or a seeded catalog.
 *
 * Flags:
 *   --aut <name>           Filter cases to one AUT (matches manifest entry name).
 *   --cohort-role <r>      'training' | 'held-out'. Default: per AUT manifest entry.
 *                          When 'held-out', no canon graduation occurs (spike §4.4 C2).
 *   --trials <n>           Run the cohort n times (default 1) and report per-trial
 *                          variance on the honest DOM-target numerator. N=1 measured
 *                          once is statistically uninterpretable (G4); a held-out
 *                          delta needs variance to be believed.
 *
 * Exit code: 0 on completion (regardless of handoff count;
 *   handoffs are evidence, not failures); non-zero only on
 *   browser/IO/configuration failure.
 */

import { Effect } from 'effect';
import { createCommandSpec } from '../../../product/cli/shared';
import { loadPublicAutCohort } from '../../customer-backlog/application/load-public-aut-cohort';
import {
  runPublicAutCohort,
  type PublicAutCaseResult,
} from '../../customer-backlog/application/public-aut-runner';
import { emitPublicAutCompilationReceipt } from '../../customer-backlog/application/public-aut-evidence';
import {
  compareToBaseline,
  loadCohortBaseline,
  type BaselineComparison,
} from '../../customer-backlog/application/cohort-baseline';

export interface CompilePublicAutResult {
  readonly autsRun: readonly string[];
  readonly casesProcessed: number;
  readonly receiptsEmitted: number;
  readonly stepsTotal: number;
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  /** Cycle 8: total false positives across all cases. A
   *  false-positive is a step where the runner matched some DOM
   *  element but the matched element is NOT the operator-authored
   *  expected target — the step "passed" on the wrong thing. */
  readonly falsePositives: number;
  /** Cycle 8: total verified semantic matches (matched element IS
   *  the operator's expected target). */
  readonly verifiedMatches: number;
  /** Cycle 8: matched steps that lack an authored expectedTarget
   *  and therefore could not be checked. Tracks the authoring
   *  debt — verifiedMatches + falsePositives is the verifiable
   *  population. */
  readonly unverifiedSteps: number;
  /** Cycle 10: which rung of the degraded-resolution ladder the
   *  DOM-targeting matches resolved on. Strict-only is the A.5
   *  baseline; the other two rungs are the ladder earning its
   *  keep. */
  readonly matchesByRung: {
    readonly strict: number;
    readonly phraseReduction: number;
    readonly inventoryScored: number;
  };
  /** Cycle 10 (journal Entry 35 priority 3): total wall-clock cost
   *  across all cases, so the summary carries the run's price tag. */
  readonly totalElapsedMs: number;
  /** Cycle 11 (G4 honest denominators): DOM-targeting steps only —
   *  every step whose verb is NOT navigate/press. The honest
   *  numerator/denominator the headline should quote, not
   *  stepsMatched (which counts navigate gimmes). */
  readonly domTargetSteps: number;
  readonly domTargetMatched: number;
  /** Cycle 11 (G4 / G1 bridge): handoffs that carried a non-empty
   *  candidate menu — the useful-handoff count. */
  readonly handoffsWithEvidence: number;
  /** Cycle 11 (G4): present only when --trials > 1. Per-trial
   *  honest-numerator variance, so a single ±1-step delta is not
   *  mistaken for signal. */
  readonly trials?: TrialsReport;
  /** Cycle 11 (G1): number of CompilationReceipts emitted to the
   *  compounding engine's log (only when --emit-compounding-receipt
   *  is set). When non-zero, a registered hypothesis with a
   *  public-aut cohort can be judged against this run. */
  readonly compoundingReceiptsEmitted: number;
  /** Cycle 11 (G2): per-AUT regression-ratchet comparisons against
   *  committed baselines (only when --check-baseline is set). */
  readonly baselineComparisons?: readonly AutBaselineComparison[];
  readonly receiptsEmittedTo: string;
  readonly perCase: readonly PublicAutCaseResult[];
}

export interface AutBaselineComparison {
  readonly aut: string;
  /** Null when no baseline is committed for this AUT (cannot
   *  regress). */
  readonly comparison: BaselineComparison | null;
}

export interface TrialsReport {
  readonly count: number;
  readonly domTargetMatchedPerTrial: readonly number[];
  readonly domTargetMatchedMin: number;
  readonly domTargetMatchedMax: number;
  readonly domTargetMatchedMean: number;
  /** Population standard deviation across trials. Zero means the
   *  runner is deterministic on this substrate (the desirable
   *  state); non-zero quantifies live-substrate flake. */
  readonly domTargetMatchedStdev: number;
}

function parseCohortRole(raw: string | undefined): 'training' | 'held-out' | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'training' || raw === 'held-out') return raw;
  throw new Error(`compile-public-aut: --cohort-role must be 'training' | 'held-out'; got '${raw}'`);
}

function parseTrials(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`compile-public-aut: --trials must be a positive integer; got '${raw}'`);
  }
  return n;
}

interface AggregateCounts {
  readonly stepsTotal: number;
  readonly stepsMatched: number;
  readonly handoffsEmitted: number;
  readonly falsePositives: number;
  readonly verifiedMatches: number;
  readonly unverifiedSteps: number;
  readonly domTargetSteps: number;
  readonly domTargetMatched: number;
  readonly handoffsWithEvidence: number;
  readonly totalElapsedMs: number;
  readonly strict: number;
  readonly phraseReduction: number;
  readonly inventoryScored: number;
}

function aggregate(results: readonly PublicAutCaseResult[]): AggregateCounts {
  let stepsTotal = 0;
  let stepsMatched = 0;
  let handoffsEmitted = 0;
  let falsePositives = 0;
  let verifiedMatches = 0;
  let unverifiedSteps = 0;
  let domTargetSteps = 0;
  let domTargetMatched = 0;
  let handoffsWithEvidence = 0;
  let totalElapsedMs = 0;
  let strict = 0;
  let phraseReduction = 0;
  let inventoryScored = 0;
  for (const r of results) {
    stepsTotal += r.stepCount;
    stepsMatched += r.stepsMatched;
    handoffsEmitted += r.handoffsEmitted;
    falsePositives += r.falsePositives;
    verifiedMatches += r.verifiedMatches;
    unverifiedSteps += r.unverifiedSteps;
    domTargetSteps += r.domTargetSteps;
    domTargetMatched += r.domTargetMatched;
    handoffsWithEvidence += r.handoffsWithEvidence;
    totalElapsedMs += r.elapsedMs;
    for (const outcome of r.stepOutcomes) {
      if (outcome.resolutionRung === 'strict') strict += 1;
      else if (outcome.resolutionRung === 'phrase-reduction') phraseReduction += 1;
      else if (outcome.resolutionRung === 'inventory-scored') inventoryScored += 1;
    }
  }
  return {
    stepsTotal, stepsMatched, handoffsEmitted, falsePositives, verifiedMatches,
    unverifiedSteps, domTargetSteps, domTargetMatched, handoffsWithEvidence,
    totalElapsedMs, strict, phraseReduction, inventoryScored,
  };
}

function trialsReport(perTrial: readonly number[]): TrialsReport {
  const count = perTrial.length;
  const min = Math.min(...perTrial);
  const max = Math.max(...perTrial);
  const mean = perTrial.reduce((a, b) => a + b, 0) / count;
  const variance = perTrial.reduce((a, b) => a + (b - mean) ** 2, 0) / count;
  return {
    count,
    domTargetMatchedPerTrial: perTrial,
    domTargetMatchedMin: min,
    domTargetMatchedMax: max,
    domTargetMatchedMean: Number(mean.toFixed(3)),
    domTargetMatchedStdev: Number(Math.sqrt(variance).toFixed(3)),
  };
}

export const compilePublicAutCommand = createCommandSpec({
  flags: ['--aut', '--cohort-role', '--trials', '--emit-compounding-receipt', '--hypothesis-id', '--check-baseline'] as const,
  parse: (context) => ({
    command: 'compile-public-aut',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) =>
      Effect.gen(function* () {
        const autFilter = context.flags.aut;
        const cohortRoleOverride = parseCohortRole(context.flags.cohortRole);
        const trials = parseTrials(context.flags.trials);
        const emitCompounding = context.flags.emitCompoundingReceipt === true;
        const hypothesisId = context.flags.hypothesisId ?? null;
        const checkBaseline = context.flags.checkBaseline === true;

        const allCases = loadPublicAutCohort(paths.rootDir);
        const filtered = autFilter ? allCases.filter((c) => c.aut.name === autFilter) : allCases;
        if (filtered.length === 0) {
          throw new Error(
            autFilter
              ? `compile-public-aut: no cases found for --aut '${autFilter}'`
              : 'compile-public-aut: cohort manifest is empty; nothing to run',
          );
        }

        const browserExecutablePath = process.env.TESSERACT_PLAYWRIGHT_EXECUTABLE;

        const runOnce = () =>
          Effect.tryPromise({
            try: () =>
              runPublicAutCohort(filtered, {
                logRoot: paths.rootDir,
                ...(cohortRoleOverride ? { cohortRole: cohortRoleOverride } : {}),
                ...(browserExecutablePath ? { browserExecutablePath } : {}),
                ignoreHTTPSErrors: true,
              }),
            catch: (cause) => new Error(`compile-public-aut: cohort run failed: ${(cause as Error).message}`),
          });

        // Trial 1 is canonical for the per-case summary; further
        // trials (G4) only contribute variance on the honest
        // numerator. Sequential, not parallel — one browser at a
        // time keeps live-substrate contention out of the variance.
        const firstResults = yield* runOnce();
        const perTrialDomTargetMatched: number[] = [aggregate(firstResults).domTargetMatched];
        for (let t = 1; t < trials; t += 1) {
          const more = yield* runOnce();
          perTrialDomTargetMatched.push(aggregate(more).domTargetMatched);
        }

        const counts = aggregate(firstResults);
        const autsRunSet = new Set(firstResults.map((r) => r.aut));

        // G2: per-AUT regression-ratchet check against committed
        // baselines. A run that drops recall/verified or raises
        // false positives below/above the committed baseline (at the
        // same substrate version) fails the build — the empirical
        // wing's regression gate.
        let baselineComparisons: AutBaselineComparison[] | undefined;
        if (checkBaseline) {
          baselineComparisons = [];
          const regressed: string[] = [];
          for (const aut of autsRunSet) {
            const autResults = firstResults.filter((r) => r.aut === aut);
            const c = aggregate(autResults);
            const baseline = loadCohortBaseline(paths.rootDir, aut);
            if (baseline === null) {
              baselineComparisons.push({ aut, comparison: null });
              continue;
            }
            const comparison = compareToBaseline(baseline, {
              aut,
              substrateVersion: autResults[0]!.substrateVersion,
              domTargetSteps: c.domTargetSteps,
              domTargetMatched: c.domTargetMatched,
              verifiedMatches: c.verifiedMatches,
              falsePositives: c.falsePositives,
            });
            baselineComparisons.push({ aut, comparison });
            if (!comparison.ok) {
              regressed.push(`${aut}: ${comparison.regressions.join('; ')}`);
            }
          }
          if (regressed.length > 0) {
            throw new Error(
              `compile-public-aut: regression against committed baseline — ${regressed.join(' | ')}`,
            );
          }
        }

        // G1: lift each case into a CompilationReceipt the compounding
        // engine can judge. Emitted only on explicit request so a
        // diagnostic run never pollutes the evidence stream. Trial 1
        // is the canonical evidence (further trials are variance only).
        let compoundingReceiptsEmitted = 0;
        if (emitCompounding) {
          for (const caseResult of firstResults) {
            yield* emitPublicAutCompilationReceipt({
              result: caseResult,
              hypothesisId,
              manifestVersion: 1,
              logRoot: paths.rootDir,
              computedAt: new Date(),
            });
            compoundingReceiptsEmitted += 1;
          }
        }

        const result: CompilePublicAutResult = {
          autsRun: Array.from(autsRunSet),
          casesProcessed: firstResults.length,
          receiptsEmitted: firstResults.length * trials,
          stepsTotal: counts.stepsTotal,
          stepsMatched: counts.stepsMatched,
          handoffsEmitted: counts.handoffsEmitted,
          falsePositives: counts.falsePositives,
          verifiedMatches: counts.verifiedMatches,
          unverifiedSteps: counts.unverifiedSteps,
          matchesByRung: {
            strict: counts.strict,
            phraseReduction: counts.phraseReduction,
            inventoryScored: counts.inventoryScored,
          },
          totalElapsedMs: counts.totalElapsedMs,
          domTargetSteps: counts.domTargetSteps,
          domTargetMatched: counts.domTargetMatched,
          handoffsWithEvidence: counts.handoffsWithEvidence,
          ...(trials > 1 ? { trials: trialsReport(perTrialDomTargetMatched) } : {}),
          compoundingReceiptsEmitted,
          ...(baselineComparisons ? { baselineComparisons } : {}),
          receiptsEmittedTo: `${paths.rootDir}/workshop/logs/public-aut-receipts`,
          perCase: firstResults,
        };
        return result;
      }),
  }),
});
