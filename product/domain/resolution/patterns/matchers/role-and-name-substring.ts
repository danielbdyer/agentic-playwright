/**
 * role-and-name-substring — Z11a.4a matcher.
 *
 * Resolves an intent whose target-shape carries a role plus a
 * case-insensitive name substring. Matches iff filtering role
 * candidates by name-substring leaves exactly one surface.
 *
 * Typical case: operator wrote "Click submit" and the parser
 * classified it to `{ role: button, nameSubstring: 'submit' }`
 * without nailing the exact casing. The button on the page is
 * actually labelled "Submit"; this matcher recovers the match.
 *
 * Precondition: intent.targetShape.role AND nameSubstring populated.
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('role-and-name-substring');

export const roleAndNameSubstringMatcher: Matcher = (ctx) => {
  const { role, nameSubstring } = ctx.intent.targetShape;
  if (!role || !nameSubstring) return Option.none();

  const needle = nameSubstring.toLowerCase();
  const candidates = ctx.surfaceIndex
    .findByRole(role)
    .filter((s) => s.name !== null && s.name.toLowerCase().includes(needle));

  if (candidates.length !== 1) return Option.none();

  const surface = candidates[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `role=${role} + name containing "${nameSubstring}" matched exactly one surface`,
  });
};
