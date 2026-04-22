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
import { testComposeClassifier } from './test-compose';
import { facetQueryClassifier } from './facet-query';
import { locatorHealthTrackClassifier } from './locator-health-track';
import { facetMintClassifier } from './facet-mint';
import { facetEnrichClassifier } from './facet-enrich';
import { observeClassifier } from './observe';
import { interactClassifier } from './interact';
import { intentFetchClassifier } from './intent-fetch';
import { navigateClassifier } from './navigate';

/** Build the default classifier registry. Classifier coverage grows
 *  verb-by-verb as each classifier lands in its own commit. Each
 *  classifier pins the rung-2 substrate semantics: shape validation
 *  plus (where a fixture needs to simulate a declared failure
 *  precondition) a read of the probe's world-setup hooks. Rung 3+
 *  replaces the hooks with real Layer-injected substrates. */
export function createDefaultVerbClassifierRegistry(): VerbClassifierRegistry {
  return verbClassifierRegistry([
    testComposeClassifier,
    facetQueryClassifier,
    locatorHealthTrackClassifier,
    facetMintClassifier,
    facetEnrichClassifier,
    observeClassifier,
    interactClassifier,
    intentFetchClassifier,
    navigateClassifier,
  ]);
}
