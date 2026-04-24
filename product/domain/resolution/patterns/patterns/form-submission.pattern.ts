/**
 * form-submission pattern — Z11a.4a reference pattern.
 *
 * Resolves submit-like click intents against form-scoped buttons in
 * specific → generic order. Applicability guard rejects non-click
 * verbs and non-submit-like intents cheaply; the matcher ladder
 * handles resolution for intents that pass the guard.
 *
 * Specificity ladder (index 0 is most specific):
 *
 *   M0: role-and-name-exact         — exact button name (e.g., "Submit")
 *   M1: role-and-name-substring     — role=button + name substring
 *   M2: form-context-submit         — the one button inside the one form
 *
 * Customer-specific matchers (framework-specific test-id patterns,
 * customer class prefixes, etc.) prepend to this array through the
 * proposal-gated catalog flow when the agent discovers them against a
 * production SUT. The generic tail (M1, M2) stays stable.
 *
 * Pure — no Effect imports.
 */

import type { Matcher, MatcherContext, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { roleAndNameExactMatcher } from '../matchers/role-and-name-exact';
import { roleAndNameSubstringMatcher } from '../matchers/role-and-name-substring';
import { formContextSubmitMatcher } from '../matchers/form-context-submit';

const SUBMIT_VERB_RE = /\b(submit|save|confirm|apply|continue)\b/i;

function isSubmitLikeClick(ctx: MatcherContext): boolean {
  if (ctx.intent.verb !== 'click') return false;
  const { name, nameSubstring } = ctx.intent.targetShape;
  if (name && SUBMIT_VERB_RE.test(name)) return true;
  if (nameSubstring && SUBMIT_VERB_RE.test(nameSubstring)) return true;
  return SUBMIT_VERB_RE.test(ctx.intent.originalActionText);
}

const matchers: readonly Matcher[] = [
  roleAndNameExactMatcher,
  roleAndNameSubstringMatcher,
  formContextSubmitMatcher,
];

export const formSubmissionPattern: Pattern = {
  id: patternId('form-submission'),
  description: 'Resolve submit-like click intents against form-scoped buttons, specific-first',
  applicabilityGuard: isSubmitLikeClick,
  matchers,
  orchestrator: firstMatchWins,
};
