/**
 * single-textbox-in-form — matcher for input intents when the page
 * has a single form with a single textbox. Fires only when the
 * intent is ambiguous (no unique role/name match) but the form
 * context itself disambiguates.
 *
 * Useful for operators who write "Enter the value" without naming
 * the field, in contexts (e.g., a single-field login form) where
 * disambiguation is obvious.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('single-textbox-in-form');

export const singleTextboxInFormMatcher: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'input') return Option.none();

  const form = ctx.surfaceIndex.findLandmarkByRole('form');
  if (Option.isNone(form)) return Option.none();

  const textboxes = ctx.surfaceIndex
    .surfacesWithin(form.value)
    .filter((s) => s.role === 'textbox');
  if (textboxes.length !== 1) return Option.none();

  const surface = textboxes[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: 'input intent disambiguated by the single textbox inside the form landmark',
  });
};
