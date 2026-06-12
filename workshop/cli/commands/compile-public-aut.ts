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
 *                          When 'held-out', no canon graduation occurs (spike §4.4 C2);
 *                          enforcement plumbing in the trust-policy gate is the
 *                          next-cycle seed — today the flag is informational and
 *                          travels in the receipt.
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
  readonly receiptsEmittedTo: string;
  readonly perCase: readonly PublicAutCaseResult[];
}

function parseCohortRole(raw: string | undefined): 'training' | 'held-out' | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'training' || raw === 'held-out') return raw;
  throw new Error(`compile-public-aut: --cohort-role must be 'training' | 'held-out'; got '${raw}'`);
}

export const compilePublicAutCommand = createCommandSpec({
  flags: ['--aut', '--cohort-role'] as const,
  parse: (context) => ({
    command: 'compile-public-aut',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) =>
      Effect.gen(function* () {
        const autFilter = context.flags.aut;
        const cohortRoleOverride = parseCohortRole(context.flags.cohortRole);

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

        const results = yield* Effect.tryPromise({
          try: () =>
            runPublicAutCohort(filtered, {
              logRoot: paths.rootDir,
              ...(cohortRoleOverride ? { cohortRole: cohortRoleOverride } : {}),
              ...(browserExecutablePath ? { browserExecutablePath } : {}),
              ignoreHTTPSErrors: true,
            }),
          catch: (cause) => new Error(`compile-public-aut: cohort run failed: ${(cause as Error).message}`),
        });

        const autsRunSet = new Set<string>();
        let stepsTotal = 0;
        let stepsMatched = 0;
        let handoffsEmitted = 0;
        let falsePositives = 0;
        let verifiedMatches = 0;
        let unverifiedSteps = 0;
        let totalElapsedMs = 0;
        let strict = 0;
        let phraseReduction = 0;
        let inventoryScored = 0;
        for (const r of results) {
          autsRunSet.add(r.aut);
          stepsTotal += r.stepCount;
          stepsMatched += r.stepsMatched;
          handoffsEmitted += r.handoffsEmitted;
          falsePositives += r.falsePositives;
          verifiedMatches += r.verifiedMatches;
          unverifiedSteps += r.unverifiedSteps;
          totalElapsedMs += r.elapsedMs;
          for (const outcome of r.stepOutcomes) {
            if (outcome.resolutionRung === 'strict') strict += 1;
            else if (outcome.resolutionRung === 'phrase-reduction') phraseReduction += 1;
            else if (outcome.resolutionRung === 'inventory-scored') inventoryScored += 1;
          }
        }

        const result: CompilePublicAutResult = {
          autsRun: Array.from(autsRunSet),
          casesProcessed: results.length,
          receiptsEmitted: results.length,
          stepsTotal,
          stepsMatched,
          handoffsEmitted,
          falsePositives,
          verifiedMatches,
          unverifiedSteps,
          matchesByRung: { strict, phraseReduction, inventoryScored },
          totalElapsedMs,
          receiptsEmittedTo: `${paths.rootDir}/workshop/logs/public-aut-receipts`,
          perCase: results,
        };
        return result;
      }),
  }),
});
