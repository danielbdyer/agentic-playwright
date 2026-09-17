/**
 * interactive-by-content — matcher for click intents against an
 * element that carries a click affordance and is named by its
 * visible text, whatever its role — including NO role at all.
 *
 * Reality-study F3 / C2: on real OutSystems Reactive screens about
 * a quarter of the interactive controls are `div`/`span` with
 * `cursor: pointer` and no ARIA role ("Filter", "Back to Overview",
 * pagination-previous, expandable headers), and most links are bare
 * `<a>` elements. Every rung above this one queries the index by
 * role; those controls are unreachable there regardless of naming.
 * This matcher is the role-agnostic floor: among the surfaces the
 * index marks `interactive`, find the one whose visible text is the
 * intent's name — exact (case-insensitive) first, then substring —
 * and fire only when it is unique.
 *
 * It deliberately ignores the intent's role hint: when the classifier
 * guessed `button` for a bare "Click Filter" and the control is a
 * roleless div, the guess is the thing that was wrong.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { IndexedSurface, Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('interactive-by-content');

function visibleText(s: IndexedSurface): string | null {
  return s.text ?? s.name;
}

function unique(candidates: readonly IndexedSurface[]): IndexedSurface | null {
  return candidates.length === 1 ? candidates[0]! : null;
}

export const interactiveByContentMatcher: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'click') return Option.none();
  const { name, nameSubstring } = ctx.intent.targetShape;
  const needle = name ?? nameSubstring;
  if (!needle) return Option.none();

  const lower = needle.toLowerCase();
  const interactive = ctx.surfaceIndex
    .findInteractive()
    .filter((s) => visibleText(s) !== null);
  const exact = unique(interactive.filter((s) => visibleText(s)!.toLowerCase() === lower));
  const surface = exact ?? unique(interactive.filter((s) => visibleText(s)!.toLowerCase().includes(lower)));
  if (surface === null) return Option.none();

  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: `interactive element (role=${surface.role}) with visible text ${exact !== null ? 'equal to' : 'containing'} "${needle}" — exactly one`,
  });
};
