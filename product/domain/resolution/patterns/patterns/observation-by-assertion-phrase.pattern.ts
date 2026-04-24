/**
 * observation-by-assertion-phrase — resolves observe-verb intents
 * that assert the presence/appearance of something named.
 *
 * Matcher ladder, specific → generic:
 *   M0: role-and-name-exact           — exact role + exact name
 *   M1: role-and-name-substring       — role + name substring
 *   M2: status-or-alert-by-name       — role inferred from semantic
 *                                       cues ("success", "error")
 *
 * Applicability: verb=observe. M0/M1 require a role in the intent;
 * M2 infers status or alert from the action text.
 *
 * Pure — no Effect imports.
 */

import type { Matcher, Pattern } from '../rung-kernel';
import { patternId } from '../rung-kernel';
import { firstMatchWins } from '../orchestrators/first-match-wins';
import { roleAndNameExactMatcher } from '../matchers/role-and-name-exact';
import { roleAndNameSubstringMatcher } from '../matchers/role-and-name-substring';
import { statusOrAlertByNameMatcher } from '../matchers/status-or-alert-by-name';

const matchers: readonly Matcher[] = [
  roleAndNameExactMatcher,
  roleAndNameSubstringMatcher,
  statusOrAlertByNameMatcher,
];

export const observationByAssertionPhrasePattern: Pattern = {
  id: patternId('observation-by-assertion-phrase'),
  description: 'Resolve observe-verb intents; infer status / alert role from semantic cues',
  applicabilityGuard: (ctx) => ctx.intent.verb === 'observe',
  matchers,
  orchestrator: firstMatchWins,
};
