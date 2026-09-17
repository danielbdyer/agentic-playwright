/**
 * content-named-interactive — the role-agnostic click floor.
 *
 * Reality-study F3 / C2: resolves `click X` where X is the visible
 * text of an element with a click affordance and no ARIA role (or a
 * role the classifier guessed wrong). Registered LAST in the default
 * registry: every role-bearing pattern gets its turn first, so this
 * only fires for the quarter of real controls the role-indexed
 * rungs cannot reach at all.
 *
 * Applicability: verb=click with some name hint. The matcher
 * enforces uniqueness among interactive surfaces.
 *
 * Pure — no Effect imports.
 */

import type { MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { interactiveByContentMatcher } from '../matchers/interactive-by-content';

function isNamedClick(ctx: MatcherContext): boolean {
  if (ctx.intent.verb !== 'click') return false;
  const { name, nameSubstring } = ctx.intent.targetShape;
  return Boolean(name ?? nameSubstring);
}

export const contentNamedInteractivePattern: Pattern = {
  id: patternId('content-named-interactive'),
  description: 'Resolve click intents against any interactive element by visible text, roleless elements included',
  applicabilityGuard: isNamedClick,
  matchers: [interactiveByContentMatcher],
  orchestrator: firstMatchWins,
};
