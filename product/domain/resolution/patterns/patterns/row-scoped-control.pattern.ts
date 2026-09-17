/**
 * row-scoped-control — resolves intents that name a row by one of
 * its cells ("the checkbox in the row for Aurora headset").
 *
 * Reality-study §10 C7 / handoff N10. Registered FIRST: an intent
 * that names a row is the most specific shape the classifier
 * produces, and the unnamed bulk-select checkbox it typically
 * targets is unreachable by every name-based rung.
 *
 * Applicability: `inRowWith` present on the target shape.
 *
 * Pure — no Effect imports.
 */

import type { MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { controlInRowByCellTextMatcher } from '../matchers/control-in-row-by-cell-text';

function namesARow(ctx: MatcherContext): boolean {
  return Boolean(ctx.intent.targetShape.inRowWith);
}

export const rowScopedControlPattern: Pattern = {
  id: patternId('row-scoped-control'),
  description: 'Resolve a control inside the row identified by a cell\'s text (C7)',
  applicabilityGuard: namesARow,
  matchers: [controlInRowByCellTextMatcher],
  orchestrator: firstMatchWins,
};
