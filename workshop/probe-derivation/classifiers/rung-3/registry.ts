/**
 * Default Rung3ClassifierRegistry for the playwright-live harness.
 *
 * Slice 6.3 ships with ZERO registered rung-3 classifiers — the
 * harness falls through to rung-2 for every verb. That's the
 * seam-proof baseline: prove the Playwright + server infrastructure
 * produces valid receipts end-to-end without yet climbing the
 * substrate ladder.
 *
 * Slice 6.4 populates the registry with observe + interact
 * classifiers — the two browser-bound verbs that benefit from
 * rung 3's real-DOM fidelity. The four pure-memory verbs
 * (facet-mint, facet-enrich, facet-query, locator-health-track),
 * test-compose, and intent-fetch deliberately stay at rung 2
 * per the Step-6 sign-off.
 */

import {
  rung3ClassifierRegistry,
  type Rung3ClassifierRegistry,
} from './port';
import { observeRung3Classifier } from './observe';
import { interactRung3Classifier } from './interact';

export function createDefaultRung3ClassifierRegistry(): Rung3ClassifierRegistry {
  return rung3ClassifierRegistry([observeRung3Classifier, interactRung3Classifier]);
}
