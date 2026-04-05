/**
 * Reason chain builder — derives a machine-readable decision trail
 * from resolution exhaustion entries and the final outcome.
 *
 * Pure function: exhaustion entries + outcome metadata in, reason chain out.
 * The chain explains *why* a resolution outcome was chosen by summarizing
 * what each rung tried and decided.
 */

import type { ResolutionExhaustionEntry, ResolutionReasonChain, ResolutionReasonStep } from './types';
import type { StepWinningSource } from '../governance/workflow-types';

/**
 * Build a reason chain from the accumulated exhaustion entries and the
 * final resolution outcome.
 *
 * Each exhaustion entry maps to a reason step. The verdict is derived from
 * the entry's outcome: 'resolved' → 'resolved', 'failed' → 'failed',
 * everything else → 'passed' (rung didn't terminate the chain).
 *
 * The winning source identifies which rung's resolution was accepted.
 * For needs-human receipts, all rungs have verdict 'passed' or 'failed'
 * and the terminal needs-human entry has verdict 'failed'.
 */
export function buildReasonChain(
  exhaustion: readonly ResolutionExhaustionEntry[],
  _winningSource: StepWinningSource,
): ResolutionReasonChain {
  return exhaustion.map((entry): ResolutionReasonStep => {
    const candidatesEvaluated =
      (entry.topCandidates?.length ?? 0) + (entry.rejectedCandidates?.length ?? 0);
    const topScore = entry.topCandidates?.[0]?.score;

    const verdict: ResolutionReasonStep['verdict'] =
      entry.outcome === 'resolved' ? 'resolved'
        : entry.outcome === 'failed' ? 'failed'
          : 'passed';

    return {
      rung: entry.stage,
      verdict,
      reason: entry.reason,
      candidatesEvaluated,
      ...(topScore !== undefined ? { topScore } : {}),
    };
  });
}

/**
 * Summarize a reason chain into a single human-readable explanation.
 *
 * Format: "Tried {n} rungs. {winning rung} resolved because: {reason}.
 * Skipped/failed: {rung1} ({reason}), {rung2} ({reason})."
 */
export function summarizeReasonChain(chain: ResolutionReasonChain): string {
  const resolved = chain.find((step) => step.verdict === 'resolved');
  const failed = chain.filter((step) => step.verdict === 'failed');
  const passed = chain.filter((step) => step.verdict === 'passed');

  if (!resolved && failed.length === chain.length) {
    return `All ${chain.length} rungs exhausted. Last failure: ${failed[failed.length - 1]?.reason ?? 'unknown'}.`;
  }

  const parts = [
    `Tried ${chain.length} rung${chain.length === 1 ? '' : 's'}.`,
    ...(resolved ? [`${resolved.rung} resolved: ${resolved.reason}`] : []),
    ...(passed.length > 0 ? [`Passed: ${passed.map((s) => s.rung).join(', ')}.`] : []),
    ...(failed.length > 0 ? [`Failed: ${failed.map((s) => `${s.rung} (${s.reason})`).join('; ')}.`] : []),
  ];

  return parts.join(' ');
}
