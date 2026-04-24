/**
 * link-in-nav-landmark — matcher for click-on-link inside a
 * navigation landmark. Fires when the intent's target-shape names
 * a link (by name or substring) and the single link with that name
 * lives inside the page's navigation landmark.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('link-in-nav-landmark');

function matchName(s: IndexedSurface, target: string, strict: boolean): boolean {
  if (s.name === null) return false;
  return strict ? s.name === target : s.name.toLowerCase().includes(target.toLowerCase());
}

export const linkInNavLandmarkMatcher: Matcher = (ctx) => {
  const { role, name, nameSubstring } = ctx.intent.targetShape;
  const targetName = name ?? nameSubstring;
  if (!targetName) return Option.none();
  if (role && role !== 'link') return Option.none();

  const nav = ctx.surfaceIndex.findLandmarkByRole('navigation');
  if (Option.isNone(nav)) return Option.none();

  const linksInNav = ctx.surfaceIndex
    .surfacesWithin(nav.value)
    .filter((s) => s.role === 'link' && matchName(s, targetName, Boolean(name)));
  if (linksInNav.length !== 1) return Option.none();

  const surface = linksInNav[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `link named "${targetName}" inside navigation landmark`,
  });
};
