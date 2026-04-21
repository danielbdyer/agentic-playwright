/**
 * Default VerbClassifier registry — the set of classifiers the
 * fixture-replay harness uses when callers don't supply their own.
 *
 * Per docs/v2-probe-ir-spike.md §6.4, classifier coverage grows
 * independently of fixture coverage: a fixture can exist for a verb
 * whose classifier is not yet registered, and that gap shows in the
 * spike verdict as `receiptsConfirmed < receiptsTotal` under
 * `--adapter fixture-replay`.
 *
 * ## Current classifier set
 *
 * Scope 3c of Step 5.5 ships with ZERO registered classifiers — the
 * fixture-replay harness works end-to-end but every probe returns
 * 'ambiguous'. Scope 3d lands the first classifier (test-compose).
 * Additional classifiers land verb-by-verb as each verb's runtime
 * handler gains a standalone, Layer-injectable surface.
 *
 * ## Why empty-at-first
 *
 * The port + harness + registry is load-bearing structure; the
 * classifiers are content. Separating the commits means every
 * classifier addition is a self-contained diff naming exactly the
 * verb it classifies and the domain logic it exercises. Reviewers
 * (and future agents) don't have to read the harness wiring to
 * judge whether a classifier is correct.
 */

import { verbClassifierRegistry, type VerbClassifierRegistry } from '../verb-classifier';

/** Build the default classifier registry. Starts empty at scope 3c;
 *  scope 3d registers test-compose; later scopes register per-verb
 *  classifiers as their handler surfaces land. */
export function createDefaultVerbClassifierRegistry(): VerbClassifierRegistry {
  return verbClassifierRegistry([]);
}
