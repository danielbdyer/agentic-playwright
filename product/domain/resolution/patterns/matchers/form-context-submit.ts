/**
 * form-context-submit — Z11a.4a matcher.
 *
 * Resolves a submit-like click intent ("Click Submit", "Save",
 * "Confirm", "Apply", "Continue") against the single button inside
 * the single form landmark on the page. Falls through when:
 *   - the intent verb is not 'click';
 *   - no form-landmark or more than one form exists;
 *   - the form contains zero or more than one button.
 *
 * This matcher fires when neither exact-name nor substring matchers
 * found a unique surface, but the form-context itself disambiguates.
 * It is deliberately positioned LATER in any pattern that uses it —
 * its signal strength is lower than a role+name match.
 *
 * Pure — no Effect imports.
 */

import { Option } from 'effect';
import type { Matcher, MatcherResult } from '../rung-kernel';
import { matcherId } from '../rung-kernel';

const MATCHER_ID = matcherId('form-context-submit');

const SUBMIT_VERB_RE = /\b(submit|save|confirm|apply|continue)\b/i;

function intentLooksSubmit(originalText: string, nameSubstring?: string): boolean {
  if (nameSubstring && SUBMIT_VERB_RE.test(nameSubstring)) return true;
  return SUBMIT_VERB_RE.test(originalText);
}

export const formContextSubmitMatcher: Matcher = (ctx) => {
  if (ctx.intent.verb !== 'click') return Option.none();

  if (!intentLooksSubmit(ctx.intent.originalActionText, ctx.intent.targetShape.nameSubstring)) {
    return Option.none();
  }

  const form = ctx.surfaceIndex.findLandmarkByRole('form');
  if (Option.isNone(form)) return Option.none();

  const buttons = ctx.surfaceIndex
    .surfacesWithin(form.value)
    .filter((s) => s.role === 'button');

  if (buttons.length !== 1) return Option.none();

  const surface = buttons[0]!;
  return Option.some<MatcherResult>({
    targetSurfaceId: surface.surfaceId,
    matcherId: MATCHER_ID,
    rationale: 'submit-like click intent matched the single button inside the form landmark',
  });
};
