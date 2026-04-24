/**
 * computeScoreboard — the top-level compounding engine program.
 *
 * Per docs/v2-compounding-engine-plan.md §4.2, this is the
 * composition that turns HypothesisLedger + ReceiptStore inputs
 * into a CompoundingScoreboard aggregate.
 *
 * Effect topology:
 *   Step 1 — fetch hypotheses / probe receipts / scenario receipts
 *            / ratchets / prior hypothesis receipts in parallel
 *            (Effect.all concurrency='unbounded').
 *   Step 2 — evaluate each hypothesis against the current cycle's
 *            evidence (Effect.all concurrency='unbounded'; pure
 *            over disjoint evidence subsets).
 *   Step 3 — append the new hypothesis receipts (sequential:
 *            log writes must serialize per-file).
 *   Step 4 — compute derived read-models (pure; no Effect needed).
 *
 * Output: a CompoundingScoreboard ready for CLI / dashboard
 * consumption.
 */

import { Effect } from 'effect';
import { SUBSTRATE_VERSION } from '../../substrate/version';
import type { CompoundingError } from '../domain/compounding-error';
import type { CompoundingScoreboard } from '../domain/scoreboard';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import { HypothesisLedger, ReceiptStore } from './ports';
import { evaluateHypothesis } from './evaluate-hypothesis';
import { computeTrajectories } from './trajectories';
import {
  computeRegressionReport,
  passingArtifactIds,
} from './regression';
import { computeGraduationGate } from './graduation';
import { computeGapReport, type GapInputs } from './gap-analysis';

export interface ComputeScoreboardOptions {
  readonly now: () => Date;
  /** Prior cycle's pass list (from the most-recent-prior snapshot,
   *  or empty when no baseline exists). */
  readonly priorPassing?: ReadonlySet<string>;
  readonly priorScoreboardFingerprint?: string;
  readonly currentScoreboardFingerprint?: string;
  /** Prior cycle's HypothesisReceipt stream — added to the
   *  trajectory input alongside this cycle's receipts. */
  readonly priorHypothesisReceipts?: readonly HypothesisReceipt[];
  readonly priorHolds?: boolean;
  readonly confirmationRateFloor?: number;
  readonly confirmationRateWindow?: number;
  /** Minimum trajectory entries (per cohort, max across cohorts)
   *  needed before the sustained-rate gate can hold. Default 3.
   *  Tests that want single-cycle graduation override to 1. */
  readonly minSustainedCycles?: number;
  /** Probe coverage inputs — target set + the surfaces the manifest
   *  declares as measurable. */
  readonly gapInputs?: Omit<GapInputs, 'probeReceipts' | 'scenarioReceipts' | 'now'>;
  readonly manifestVersion?: number;
}

export function computeScoreboard(
  options: ComputeScoreboardOptions,
): Effect.Effect<CompoundingScoreboard, CompoundingError, HypothesisLedger | ReceiptStore> {
  return Effect.gen(function* () {
    const ledger = yield* HypothesisLedger;
    const store = yield* ReceiptStore;

    // Step 1 — parallel-safe fetches.
    // Z10c note: priorHypothesisReceipts is ALSO fetched here from
    // the store, making multi-cycle trajectories automatic across
    // CLI invocations. Callers that want to pin a specific prior
    // slice (tests) can still override via
    // options.priorHypothesisReceipts — when set, it REPLACES the
    // store read rather than appending to it, because tests want
    // hermetic control over trajectory length.
    const [hypotheses, probeReceipts, scenarioReceipts, compilationReceipts, ratchets, storedPriorReceipts] =
      yield* Effect.all(
        [
          ledger.listAll(),
          store.latestProbeReceipts(),
          store.latestScenarioReceipts(),
          store.latestCompilationReceipts(),
          store.listRatchets(),
          options.priorHypothesisReceipts === undefined
            ? store.listHypothesisReceipts()
            : Effect.succeed(options.priorHypothesisReceipts),
        ],
        { concurrency: 'unbounded' },
      );

    // Step 2 — parallel-safe per-hypothesis evaluation.
    const buildOptions = {
      now: options.now,
      manifestVersion: options.manifestVersion ?? 1,
    } as const;
    const newHypothesisReceipts = yield* Effect.all(
      hypotheses.map((h) =>
        evaluateHypothesis(h, probeReceipts, scenarioReceipts, buildOptions, compilationReceipts),
      ),
      { concurrency: 'unbounded' },
    );

    // Step 3 — sequential append to the hypothesis-receipt log.
    for (const r of newHypothesisReceipts) {
      yield* store.appendHypothesisReceipt(r);
    }

    // Step 4 — pure derived read-models.
    // Trajectories include every prior hypothesis receipt the store
    // has ever persisted (Z10c) plus the new receipts computed this
    // cycle. Deduplication-by-fingerprint is unnecessary: each cycle
    // produces receipts whose `computedAt` differs, so appending the
    // new receipts gives a strictly longer trajectory tail.
    const allHypothesisReceipts = [
      ...storedPriorReceipts,
      ...newHypothesisReceipts,
    ];
    const trajectories = computeTrajectories(hypotheses, allHypothesisReceipts);

    const priorPassing = options.priorPassing ?? new Set<string>();
    const regression = computeRegressionReport({
      priorPassing,
      baselineFingerprint: options.priorScoreboardFingerprint ?? '',
      currentFingerprint: options.currentScoreboardFingerprint ?? '',
      probeReceipts,
      scenarioReceipts,
      ratchets,
      now: options.now,
    });

    const currentPassing = passingArtifactIds(probeReceipts, scenarioReceipts);

    const gapReport = computeGapReport({
      probeTargets: options.gapInputs?.probeTargets ?? [],
      scenarioTargets: options.gapInputs?.scenarioTargets ?? [],
      invariantsHeldByScenario: options.gapInputs?.invariantsHeldByScenario,
      probeReceipts,
      scenarioReceipts,
      now: options.now,
    });

    const probeCoverageRatio = computeProbeCoverageRatio(
      probeReceipts,
      options.gapInputs?.probeTargets ?? [],
    );
    const scenarioPassRatio = computeScenarioPassRatio(scenarioReceipts);

    const graduation = computeGraduationGate({
      probeCoverageRatio,
      scenarioPassRatio,
      trajectories,
      regression: priorPassing.size > 0 ? regression : null,
      confirmationRateFloor: options.confirmationRateFloor ?? 0.8,
      confirmationRateWindow: options.confirmationRateWindow ?? 10,
      priorHolds: options.priorHolds ?? false,
      minSustainedCycles: options.minSustainedCycles,
    });

    void currentPassing; // captured; the Z7 snapshot store will read it.

    return {
      generatedAt: options.now().toISOString(),
      probeCoverageRatio,
      scenarioPassRatio,
      trajectories,
      activeRatchetCount: ratchets.length,
      brokenRatchetCount: regression.ratchetBreaks.length,
      graduation,
      gaps: gapReport,
      lastRegression: priorPassing.size > 0 ? regression : null,
      substrateVersion: SUBSTRATE_VERSION,
    };
  });
}

function computeProbeCoverageRatio(
  probeReceipts: readonly { readonly payload: { readonly cohort: { readonly verb: string; readonly facetKind: string; readonly errorFamily: string | null }; readonly outcome: { readonly completedAsExpected: boolean } } }[],
  targets: readonly { readonly verb: string; readonly facetKind: string; readonly errorFamily: string | null }[],
): number {
  if (targets.length === 0) return probeReceipts.length > 0 ? 1 : 0;
  const passingKeys = new Set<string>();
  for (const r of probeReceipts) {
    if (!r.payload.outcome.completedAsExpected) continue;
    passingKeys.add(surfaceKey(r.payload.cohort));
  }
  let covered = 0;
  for (const t of targets) {
    if (passingKeys.has(surfaceKey(t))) covered += 1;
  }
  return covered / targets.length;
}

function computeScenarioPassRatio(
  scenarioReceipts: readonly { readonly payload: { readonly verdict: string } }[],
): number {
  if (scenarioReceipts.length === 0) return 0;
  const passing = scenarioReceipts.filter((r) => r.payload.verdict === 'trajectory-holds').length;
  return passing / scenarioReceipts.length;
}

function surfaceKey(cohort: {
  readonly verb: string;
  readonly facetKind: string;
  readonly errorFamily: string | null;
}): string {
  return `${cohort.verb}|${cohort.facetKind}|${cohort.errorFamily ?? 'none'}`;
}
