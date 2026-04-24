/**
 * `tesseract compile-corpus` — walk the customer-backlog corpus,
 * classify per-step outcomes heuristically, and emit a
 * CompilationReceipt per ADO case.
 *
 * Z11a.5 scope: receipts are produced by the Z11a.4b intent
 * classifier (heuristic). The full compile pipeline integration
 * (parse → bind → resolve via the 11-rung precedence ladder) is
 * deferred to Z11d when the live reasoning adapter closes the gap
 * between raw ADO text and bind. Receipts carry
 * `substrateVersion: 'heuristic-z11a5'` so downstream drift-
 * detection distinguishes them from future real-compile receipts.
 *
 * Exit code: 0 on success; Effect failures bubble as non-zero.
 */

import { Effect } from 'effect';
import type { CompilationReceipt } from '../../compounding/domain/compilation-receipt';
import { createCommandSpec } from '../../../product/cli/shared';
import { classifyCase } from '../../customer-backlog/application/heuristic-classifier';
import { loadCustomerBacklogCorpus } from '../../customer-backlog/application/load-corpus';
import { emitCompilationReceipt } from '../../compounding/emission/compile-receipt-emitter';

const SUBSTRATE_VERSION_Z11A5 = 'heuristic-z11a5';
const MANIFEST_VERSION_BASELINE = 1;

export interface CompileCorpusResult {
  readonly corpusEvaluated: 'resolvable' | 'needs-human' | 'both';
  readonly casesProcessed: number;
  readonly receiptsEmitted: number;
  readonly totalResolvedSteps: number;
  readonly totalNeedsHumanSteps: number;
  readonly totalBlockedSteps: number;
  readonly totalLatencyMs: number;
  readonly receiptsEmittedTo: string;
}

function parseCorpusFilter(raw: string | undefined): 'resolvable' | 'needs-human' | 'both' {
  if (!raw || raw === 'both' || raw === 'all') return 'both';
  if (raw === 'resolvable' || raw === 'needs-human') return raw;
  throw new Error(
    `compile-corpus: --corpus must be 'resolvable' | 'needs-human' | 'both'; got '${raw}'`,
  );
}

export const compileCorpusCommand = createCommandSpec({
  flags: ['--corpus', '--hypothesis-id'] as const,
  parse: (context) => ({
    command: 'compile-corpus',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) =>
      Effect.gen(function* () {
        const runStart = Date.now();
        const corpusFilter = parseCorpusFilter(context.flags.corpus);
        const hypothesisId = context.flags.hypothesisId ?? null;

        const cases = loadCustomerBacklogCorpus(paths.rootDir).filter(
          (c) => corpusFilter === 'both' || c.corpus === corpusFilter,
        );

        const receipts: CompilationReceipt[] = [];
        let totalResolvedSteps = 0;
        let totalNeedsHumanSteps = 0;
        let totalBlockedSteps = 0;

        for (const c of cases) {
          const caseStart = Date.now();
          const summary = classifyCase(c.snapshot, c.corpus);
          const caseLatency = Date.now() - caseStart;

          totalResolvedSteps += summary.resolvedCount;
          totalNeedsHumanSteps += summary.needsHumanCount;
          totalBlockedSteps += summary.blockedCount;

          const receipt = yield* emitCompilationReceipt({
            summary,
            hypothesisId,
            reasoningReceiptIds: [],
            totalLatencyMs: caseLatency,
            substrateVersion: SUBSTRATE_VERSION_Z11A5,
            manifestVersion: MANIFEST_VERSION_BASELINE,
            adoContentHash: c.snapshot.contentHash,
            computedAt: new Date(),
            logRoot: paths.rootDir,
          });
          receipts.push(receipt);
        }

        const result: CompileCorpusResult = {
          corpusEvaluated: corpusFilter,
          casesProcessed: cases.length,
          receiptsEmitted: receipts.length,
          totalResolvedSteps,
          totalNeedsHumanSteps,
          totalBlockedSteps,
          totalLatencyMs: Date.now() - runStart,
          receiptsEmittedTo: `${paths.rootDir}/workshop/logs/compilation-receipts`,
        };
        return result;
      }),
  }),
});
