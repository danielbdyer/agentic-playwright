/**
 * Pattern Registry — Z11a.4b.
 *
 * Thin container for the ordered list of DOM-shape patterns
 * consulted by the pattern-resolution strategy at the
 * `'shared-patterns'` rung of the canonical resolution precedence
 * ladder.
 *
 * The registry is a plain readonly structure — not an Effect
 * Context.Tag service — because the patterns it holds are pure
 * domain values captured once at composition time. Customer
 * deployments extend this registry via the proposal-gated catalog
 * flow (adding patterns or prepending matchers to existing ones);
 * runtime mutation is not supported.
 *
 * Production default seeds with `formSubmissionPattern` (Z11a.4a);
 * Z11a.4c adds five more seed patterns to the default list.
 */

import type { Pattern } from './rung-kernel';
import { dialogConfirmationPattern } from './patterns/dialog-confirmation.pattern';
import { fieldInputByLabelPattern } from './patterns/field-input-by-label.pattern';
import { formSubmissionPattern } from './patterns/form-submission.pattern';
import { locatorByRoleAndNamePattern } from './patterns/locator-by-role-and-name.pattern';
import { navigationLinkByNamePattern } from './patterns/navigation-link-by-name.pattern';
import { observationByAssertionPhrasePattern } from './patterns/observation-by-assertion-phrase.pattern';

export interface PatternRegistry {
  readonly patterns: readonly Pattern[];
}

export function createPatternRegistry(patterns: readonly Pattern[]): PatternRegistry {
  return { patterns };
}

/** The production default registry. Ordered specific → generic so
 *  tightly-scoped patterns fire before broad-applicability ones.
 *  Agent-discovered customer-specific patterns prepend to this list
 *  at composition time via the proposal-gated catalog flow. */
export const DEFAULT_PATTERN_REGISTRY: PatternRegistry = createPatternRegistry([
  dialogConfirmationPattern,           // narrowest: dialog-scoped buttons
  navigationLinkByNamePattern,         // narrow: nav-landmark-scoped links
  formSubmissionPattern,               // narrow: form-scoped submit
  fieldInputByLabelPattern,            // input verb; includes form-single-textbox fallback
  observationByAssertionPhrasePattern, // observe verb; includes status/alert inference
  locatorByRoleAndNamePattern,         // generic: any role+name intent
]);
