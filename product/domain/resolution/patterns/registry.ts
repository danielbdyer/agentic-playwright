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
import { formSubmissionPattern } from './patterns/form-submission.pattern';

export interface PatternRegistry {
  readonly patterns: readonly Pattern[];
}

export function createPatternRegistry(patterns: readonly Pattern[]): PatternRegistry {
  return { patterns };
}

/** The production default registry. Grows as Z11a.4c adds patterns. */
export const DEFAULT_PATTERN_REGISTRY: PatternRegistry = createPatternRegistry([
  formSubmissionPattern,
]);
