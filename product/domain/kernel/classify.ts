/**
 * First-match-wins classification: a small algebraic helper for
 * functions that walk an ordered list of predicates over a subject
 * and return the classification of the first matching rule.
 *
 * This pattern differs from a `fold*` function (which dispatches
 * over a closed tagged union) and from a `chainVerdict` gate chain
 * (which threads state through sequential steps with short-circuit
 * on failure). First-match-wins classification is:
 *
 *   - The subject is a single input (not a threaded state).
 *   - Rules are predicate + classification pairs.
 *   - Walk rules in order; return the classification of the first
 *     predicate that matches.
 *   - If no rule matches, return `null` (callers can default to
 *     a fallback classification at their boundary).
 *
 * Two concrete instances in the codebase use this pattern today:
 *
 *   - `classifyFailure` in `workshop/orchestration/fitness.ts`
 *     — classifies a `StepOutcome` into a `PipelineFailureClass`
 *     based on translation score thresholds, recovery success, and
 *     winning-source fallback patterns.
 *   - `classifyFailure` in
 *     `product/instruments/reporting/tesseract-reporter.ts` —
 *     classifies a Playwright error message into a
 *     `FailureClassification` based on substring matches.
 *
 * Both functions previously used inline if/return chains. The
 * extracted `classify` helper makes the rule table into data,
 * which enables:
 *
 *   - Tests that enumerate each rule and verify it fires on a
 *     known input.
 *   - Introspection (listing rules, dumping the classifier
 *     behavior as documentation).
 *   - Rule reordering without restructuring control flow.
 *
 * Pure domain — no Effect, no IO, no mutation.
 */

/** A single classification rule: a predicate over a subject and
 *  a classification result to return when the predicate matches.
 *  The result function receives the subject so rules can return
 *  classifications that depend on subject state (e.g., "return
 *  `alias-coverage-gap` when unresolved, otherwise
 *  `translation-normalization-gap`"). */
export interface ClassificationRule<T, R> {
  readonly test: (subject: T) => boolean;
  readonly result: (subject: T) => R;
}

/** Walk an ordered list of classification rules and return the
 *  result of the first rule whose predicate matches. Returns
 *  `null` when no rule matches; callers can default to a
 *  fallback classification at the call site.
 *
 *  Pure function. The rule order IS load-bearing — earlier rules
 *  take precedence over later rules when multiple predicates
 *  would match. */
export function classify<T, R>(
  subject: T,
  rules: readonly ClassificationRule<T, R>[],
): R | null {
  for (const rule of rules) {
    if (rule.test(subject)) {
      return rule.result(subject);
    }
  }
  return null;
}

/** Variant of `classify` that requires a fallback classification.
 *  Useful for classifiers that must always produce a result (e.g.,
 *  the tesseract-reporter failure classifier which defaults to
 *  `'unknown'` when no rule matches). */
export function classifyOrFallback<T, R>(
  subject: T,
  rules: readonly ClassificationRule<T, R>[],
  fallback: R,
): R {
  return classify(subject, rules) ?? fallback;
}
