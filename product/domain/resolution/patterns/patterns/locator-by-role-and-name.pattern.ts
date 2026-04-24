/**
 * locator-by-role-and-name — the generic workhorse pattern.
 *
 * Applies to any intent whose target-shape carries both a role and
 * some name hint (exact or substring). Matcher ladder is the
 * generic role+name resolution: exact first, substring second.
 *
 * This pattern is the last broadly-applicable fallback in the
 * registry; more-specific patterns (form-submission, navigation-
 * link-by-name, dialog-confirmation) should run first because
 * their guards scope them to tighter contexts. This one fires for
 * intents that didn't match any context-specific pattern but still
 * carry enough shape to attempt a role+name lookup.
 *
 * Pure — no Effect imports.
 */

import type { Matcher, MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { roleAndNameExactMatcher } from '../matchers/role-and-name-exact';
import { roleAndNameSubstringMatcher } from '../matchers/role-and-name-substring';

function hasRoleAndName(ctx: MatcherContext): boolean {
  const { role, name, nameSubstring } = ctx.intent.targetShape;
  return Boolean(role) && Boolean(name ?? nameSubstring);
}

const matchers: readonly Matcher[] = [
  roleAndNameExactMatcher,
  roleAndNameSubstringMatcher,
];

export const locatorByRoleAndNamePattern: Pattern = {
  id: patternId('locator-by-role-and-name'),
  description: 'Generic role + accessible-name locator; applies when both are present',
  applicabilityGuard: hasRoleAndName,
  matchers,
  orchestrator: firstMatchWins,
};
