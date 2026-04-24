/**
 * role-and-name-exact — Z11a.4a matcher.
 *
 * Resolves an intent whose target-shape carries BOTH a role and an
 * exact accessible name. Matches iff the surface index returns
 * exactly one surface with that role+name. Ambiguity (zero or more
 * than one match) falls through to a more-generic matcher.
 *
 * Precondition: intent.targetShape.role + intent.targetShape.name
 * both populated. If either is missing the matcher returns None —
 * the pattern's next rung gets to try.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('role-and-name-exact');

export const roleAndNameExactMatcher: Matcher = (ctx) => {
  const { role, name } = ctx.intent.targetShape;
  if (!role || !name) return Option.none();

  const matches = ctx.surfaceIndex.findByRoleAndName(role, name);
  if (matches.length !== 1) return Option.none();

  const surface = matches[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `role=${role} + name="${name}" matched exactly one surface`,
  });
};
