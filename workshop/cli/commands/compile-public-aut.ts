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
        for (const r of results) {
          autsRunSet.add(r.aut);
          stepsTotal += r.stepCount;
          stepsMatched += r.stepsMatched;
          handoffsEmitted += r.handoffsEmitted;
        }

        const result: CompilePublicAutResult = {
          autsRun: Array.from(autsRunSet),
          casesProcessed: results.length,
          receiptsEmitted: results.length,
          stepsTotal,
          stepsMatched,
          handoffsEmitted,
          receiptsEmittedTo: `${paths.rootDir}/workshop/logs/public-aut-receipts`,
          perCase: results,
        };
        return result;
      }),
  }),
});
