/**
 * role-and-name-in-landmark — matcher that scopes a role+name lookup
 * to the landmark the intent names (`TargetShapeHint.inLandmark`).
 *
 * Reality-study F4 / C3: `banner` + `navigation` + `main` are on
 * every real Reactive route, `search` on every list/gallery route —
 * the one axis where real DOM is MORE structured than the synthetic
 * substrate, and the cheapest reliable scoping signal available.
 * The hint existed on the kernel but the classifier never populated
 * it and no matcher read it. Now the classifier emits it from
 * landmark cues in the prose ("in the navigation", "the Search
 * field", "footer link") and this matcher consumes it:
 *
 *   1. no hint → None (fall through; this rung is pure precision).
 *   2. landmark not present on the page → None.
 *   3. among surfaces within the landmark, keep those matching the
 *      role hint (when present) and the name (exact when the hint is
 *      exact, substring otherwise); fire iff unique.
 *
 * Positioned FIRST in the patterns that use it: a landmark-scoped
 * unique match is more specific than a page-wide one.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('role-and-name-in-landmark');

function matchName(s: IndexedSurface, target: string, strict: boolean): boolean {
  if (s.name === null) return false;
  return strict ? s.name === target : s.name.toLowerCase().includes(target.toLowerCase());
}

export const roleAndNameInLandmarkMatcher: Matcher = (ctx) => {
  const { role, name, nameSubstring, inLandmark } = ctx.intent.targetShape;
  if (!inLandmark) return Option.none();
  const targetName = name ?? nameSubstring;
  if (!targetName) return Option.none();

  const landmark = ctx.surfaceIndex.findLandmarkByRole(inLandmark);
  if (Option.isNone(landmark)) return Option.none();

  const candidates = ctx.surfaceIndex
    .surfacesWithin(landmark.value)
    .filter((s) => (role ? s.role === role : true) && matchName(s, targetName, Boolean(name)));
  if (candidates.length !== 1) return Option.none();

  const surface = candidates[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `${role ?? 'any role'} named "${targetName}" is the only match inside the ${inLandmark} landmark`,
  });
};
