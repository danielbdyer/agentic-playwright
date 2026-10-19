/**
 * The heuristic decider: no model. It re-ranks the snapshot's candidates
 * with resolve's pre-filter (with the data row's values, which the
 * observer does not know, so a row named by "@policyNumber" can score) and
 * commits only when one candidate clearly wins; otherwise it asks a human.
 * It never breaks a tie by document order.
 */
import type { Candidate, Hint } from '../contract/schemas.js';
import { decideTarget, rankCandidates, type DecideOptions } from '../resolve/index.js';
import type { Decider, DeciderInput, Decision, HandoffCandidate } from './types.js';

const describeCandidate = (candidate: Candidate | undefined, hint?: Hint): HandoffCandidate | null => {
  if (candidate === undefined) return null;
  const where = [
    candidate.landmark !== undefined ? `in ${candidate.landmark}` : null,
    candidate.rowText !== undefined ? `row "${candidate.rowText.slice(0, 60)}"` : null,
    candidate.dataBlock !== undefined ? `block ${candidate.dataBlock}` : null,
  ].filter((part): part is string => part !== null);
  const why = [hint === undefined ? null : `score ${hint.score.toFixed(2)}: ${hint.why}`, where.length > 0 ? where.join(', ') : null]
    .filter((part): part is string => part !== null)
    .join('; ');
  return { ref: candidate.ref, role: candidate.role, name: candidate.name, ...(why.length > 0 ? { why } : {}) };
};

const candidatesFor = (refs: readonly string[], byRef: ReadonlyMap<string, Candidate>, hints: readonly Hint[]): HandoffCandidate[] =>
  refs.flatMap((ref) => {
    const described = describeCandidate(byRef.get(ref), hints.find((h) => h.ref === ref));
    return described === null ? [] : [described];
  });

/** Rank with the data row's values; fall back to the observer's hints when ranking yields nothing. */
export const rankFor = (input: DeciderInput, candidates: readonly Candidate[]): readonly Hint[] => {
  const ranked = rankCandidates(input.intent, candidates, { params: { ...input.params }, limit: 10 });
  if (ranked.length > 0) return ranked;
  const allowed = new Set(candidates.map((c) => c.ref));
  return input.hints.filter((hint) => allowed.has(hint.ref));
};

export const heuristicDecision = (input: DeciderInput, options: DecideOptions = {}): Decision => {
  const excluded = new Set(input.exclude);
  const candidates = input.snapshot.candidates.filter((c) => !excluded.has(c.ref));
  const byRef = new Map(candidates.map((c) => [c.ref, c] as const));
  const hints = rankFor(input, candidates);
  const decided = decideTarget(input.intent, hints, candidates, options);
  switch (decided.kind) {
    case 'chosen':
      return {
        kind: 'act',
        ref: decided.ref,
        verb: input.intent.verb,
        ...(input.intent.value !== null ? { value: input.intent.value } : {}),
        ...(input.assertion !== undefined
          ? { assertion: { kind: input.assertion.kind, ...(input.assertion.expected !== null ? { expected: input.assertion.expected } : {}) } }
          : {}),
        reason: decided.reason,
        rejected: decided.rejected,
      };
    case 'ambiguous':
      return { kind: 'handoff', blockage: 'ambiguous-target', reason: decided.reason, candidates: candidatesFor(decided.refs, byRef, hints) };
    case 'none':
      return {
        kind: 'handoff',
        blockage: 'not-found',
        reason: decided.reason,
        candidates: candidatesFor(hints.slice(0, 3).map((h) => h.ref), byRef, hints),
      };
    default: {
      const never: never = decided;
      return never;
    }
  }
};

export const createHeuristicDecider = (options: DecideOptions = {}): Decider => ({
  name: 'heuristic',
  decide: async (input) => heuristicDecision(input, options),
});
