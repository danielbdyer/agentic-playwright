/**
 * First-match-wins orchestrator — Z11a.4a.
 *
 * Walks a pattern's matcher list in declaration order (which is the
 * specificity gradient: index 0 is most specific, higher indexes are
 * more generic). Returns the first matcher whose result is Some,
 * stamping the pattern id + matcher index onto the candidate.
 *
 * This is the default orchestrator for patterns where specificity
 * and confidence are monotonic (true for the majority of DOM-shape
 * patterns). Alternative orchestrators can be authored when a
 * pattern needs multi-match disambiguation — see the rung-kernel's
 * `Orchestrator` type.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { Orchestrator, PatternRungResult } from '../rung-kernel';

export const firstMatchWins: Orchestrator = (pattern, ctx): PatternRungResult => {
  if (!pattern.applicabilityGuard(ctx)) {
    return { kind: 'no-match', patternId: pattern.id };
  }

  for (let matcherIndex = 0; matcherIndex < pattern.matchers.length; matcherIndex += 1) {
    const matcher = pattern.matchers[matcherIndex]!;
    const outcome = matcher(ctx);
    if (Option.isSome(outcome)) {
      return {
        kind: 'matched',
        candidate: {
          targetSurfaceId: outcome.value.targetSurfaceId,
          patternId: pattern.id,
          matcherId: outcome.value.matcherId,
          matcherIndex,
          rationale: outcome.value.rationale,
        },
      };
    }
  }

  return { kind: 'no-match', patternId: pattern.id };
};
