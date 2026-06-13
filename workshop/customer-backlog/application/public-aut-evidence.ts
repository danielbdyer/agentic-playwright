/**
 * Public-AUT → compounding-evidence adapter (Cycle 11 / G1).
 *
 * The praxis audit's central finding (docs/v2-self-improvement-praxis-audit.md
 * §G1): the empirical cold-start cohort was invisible to the
 * compounding engine. Every number about reality lived in journal
 * prose and gitignored receipts; none of it could be registered as
 * a prediction, mechanically confirmed/refuted, or roll into
 * `metric-hypothesis-confirmation-rate`.
 *
 * This module closes that gap WITHOUT a parallel evaluator. A
 * public-AUT case IS an ADO test case compiled against a real app,
 * so it maps onto the existing `CompilationReceipt` shape — and the
 * existing `confirmation-rate` and `intervention-fidelity`
 * evaluators (workshop/compounding/application/confirmation-judgments.ts)
 * then apply UNCHANGED. The per-AUT granularity lives on the
 * hypothesis's `public-aut` Cohort (workshop/compounding/domain/cohort.ts);
 * evidence binds by hypothesisId, the same attribution axis every
 * other cohort uses.
 *
 * The mapping is deliberately HONEST (G4 denominators):
 *
 *   totalStepCount   = domTargetSteps      (NOT stepCount — navigate
 *                                            and press gimmes excluded)
 *   resolvedStepCount = domTargetMatched   (real DOM matches)
 *   needsHumanCount   = domTargetSteps − domTargetMatched (the misses)
 *   handoffsEmitted   = domTargetSteps − domTargetMatched
 *   handoffsWithValidMissingContext = handoffsWithEvidence
 *
 * That last line is the load-bearing bridge: the cycle-10
 * evidence-carrying handoff (a non-matched DOM-target step whose
 * receipt carries a ranked candidate menu) IS a handoff with valid
 * missing context. So the intervention-fidelity prediction directly
 * measures "do our handoffs hand the next rung something usable?" —
 * exactly the cycle-10 design goal, now mechanically scored.
 *
 * Pure builder (`publicAutCaseToCompilationSummary`) + Effect-wrapped
 * writer (`emitPublicAutCompilationReceipt`) that reuses the canonical
 * `emitCompilationReceipt` so the artifact lands in the same
 * `workshop/logs/compilation-receipts/` directory the compounding
 * engine's ReceiptStore already reads. No new log path, no new
 * evaluator branch, no parallel apparatus.
 */

import { Effect } from 'effect';
import type { HeuristicCaseSummary } from './heuristic-classifier';
import type { PublicAutCaseResult } from './public-aut-runner';
import {
  emitCompilationReceipt,
  type EmitCompileReceiptOptions,
} from '../../compounding/emission/compile-receipt-emitter';
import type { CompilationReceipt } from '../../compounding/domain/compilation-receipt';

/**
 * Pure mapping from a public-AUT case result to the compilation-
 * receipt summary shape the compounding evaluators consume. Kept
 * pure + exported so the laws can pin the mapping without touching
 * the filesystem or a browser.
 *
 * `perStepOutcomes` is empty: the public-AUT cohort's step-level
 * detail lives in its own receipt log (public-aut-receipts); the
 * compounding receipt only needs the aggregate counts the
 * evaluators fold over.
 */
export function publicAutCaseToCompilationSummary(
  result: PublicAutCaseResult,
): HeuristicCaseSummary {
  const misses = result.domTargetSteps - result.domTargetMatched;
  return {
    adoId: result.adoId,
    corpus: 'public-aut',
    totalSteps: result.domTargetSteps,
    resolvedCount: result.domTargetMatched,
    needsHumanCount: misses,
    blockedCount: 0,
    handoffsEmittedCount: misses,
    handoffsWithValidContextCount: result.handoffsWithEvidence,
    perStepOutcomes: [],
  };
}

export interface EmitPublicAutReceiptOptions {
  readonly result: PublicAutCaseResult;
  readonly hypothesisId: string | null;
  /** Manifest version stamp; the cohort bridge has no manifest
   *  dependency of its own, so callers pass the workspace manifest
   *  version (or 1 when unbound). */
  readonly manifestVersion: number;
  readonly logRoot: string;
  readonly computedAt: Date;
}

/**
 * Emit a CompilationReceipt for a public-AUT case into the
 * compounding engine's compilation-receipt log. Reuses the
 * canonical `emitCompilationReceipt` so the artifact is
 * byte-shape-identical to a synthetic-corpus compilation receipt
 * and is picked up by `latestCompilationReceipts()` with no store
 * changes.
 */
export function emitPublicAutCompilationReceipt(
  options: EmitPublicAutReceiptOptions,
): Effect.Effect<CompilationReceipt, never, never> {
  const summary = publicAutCaseToCompilationSummary(options.result);
  const emitOptions: EmitCompileReceiptOptions = {
    summary,
    hypothesisId: options.hypothesisId,
    // No reasoning yet on the cohort path (G10 lands with Z11d); the
    // receipt's cost envelope is wall-clock only.
    reasoningReceiptIds: [],
    totalLatencyMs: options.result.elapsedMs,
    substrateVersion: options.result.substrateVersion,
    manifestVersion: options.manifestVersion,
    adoContentHash: options.result.adoContentHash,
    computedAt: options.computedAt,
    logRoot: options.logRoot,
  };
  return emitCompilationReceipt(emitOptions);
}
