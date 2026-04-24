/**
 * field-input-by-label — resolves input-verb intents against
 * textboxes, using the accessible name (which includes aria-label,
 * aria-labelledby, or the rendered <label> text in the substrate's
 * surface projection).
 *
 * Matcher ladder, specific → generic:
 *   M0: role-and-name-exact         — exact textbox name
 *   M1: role-and-name-substring     — substring match on textbox name
 *   M2: single-textbox-in-form      — the one textbox in the form
 *
 * Applicability: verb=input. The intent need not carry a role — if
 * verb is input, the target is implicitly a textbox; M0/M1 try the
 * named path, M2 handles the single-textbox-in-form fallback.
 *
 * Pure — no Effect imports.
 */

import type { Matcher, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { roleAndNameExactMatcher } from '../matchers/role-and-name-exact';
import { roleAndNameSubstringMatcher } from '../matchers/role-and-name-substring';
import { singleTextboxInFormMatcher } from '../matchers/single-textbox-in-form';

const matchers: readonly Matcher[] = [
  roleAndNameExactMatcher,
  roleAndNameSubstringMatcher,
  singleTextboxInFormMatcher,
];

export const fieldInputByLabelPattern: Pattern = {
  id: patternId('field-input-by-label'),
  description: 'Resolve input intents against form textboxes by label (exact / substring / single-in-form)',
  applicabilityGuard: (ctx) => ctx.intent.verb === 'input',
  matchers,
  orchestrator: firstMatchWins,
};
