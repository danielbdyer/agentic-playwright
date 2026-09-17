/**
 * textbox-by-placeholder — matcher for input intents against a
 * field whose only name is its placeholder (reality-study F2 / C1:
 * every Reactive search box in the study corpus, 5/7 routes).
 *
 * `IndexedSurface.name` already carries the accname result, so a
 * placeholder-named field usually resolves at the role+name rungs
 * above this one. This matcher is the fallback for an index whose
 * naming resolution recorded the placeholder separately (older
 * discovery runs, third-party catalogs) and the rung whose
 * provenance says "emit a `getByPlaceholder` strategy".
 *
 * Ladder inside the matcher: exact (case-insensitive) placeholder
 * first, then substring; each must be unique to fire.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('textbox-by-placeholder');

function unique(candidates: readonly IndexedSurface[]): IndexedSurface | null {
  return candidates.length === 1 ? candidates[0]! : null;
}

export const textboxByPlaceholderMatcher: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'input') return Option.none();
  const { name, nameSubstring } = ctx.intent.targetShape;
  const needle = name ?? nameSubstring;
  if (!needle) return Option.none();

  const lower = needle.toLowerCase();
  const withPlaceholder = ctx.surfaceIndex
    .findInteractive()
    .filter((s) => s.placeholder !== null);
  const exact = unique(withPlaceholder.filter((s) => s.placeholder!.toLowerCase() === lower));
  const surface = exact ?? unique(withPlaceholder.filter((s) => s.placeholder!.toLowerCase().includes(lower)));
  if (surface === null) return Option.none();

  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `placeholder "${surface.placeholder}" ${exact !== null ? 'equals' : 'contains'} "${needle}" on exactly one field`,
  });
};
