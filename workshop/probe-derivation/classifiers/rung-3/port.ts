/**
 * Rung3Classifier — the substrate-bound classifier port.
 *
 * Where rung-2 classifiers (workshop/probe-derivation/verb-classifier.ts)
 * take only a Probe and return an observed outcome, rung-3 classifiers
 * ALSO receive a Playwright `Page` — the rendered DOM of the synthetic
 * substrate at the probe's WorldShape URL. The Page is the substrate's
 * handshake to the classifier.
 *
 * ## Why a separate port
 *
 * Rung-2 classifiers are pure (no Layer dependencies). Rung-3 classifiers
 * require a Page — a live object with async methods, disposal semantics,
 * and substrate-bound behavior. Rather than thread a Page through the
 * rung-2 port's environment type, we name rung-3 as its own port; the
 * PlaywrightLiveProbeHarness owns the Page's lifecycle and delegates
 * classification through this port.
 *
 * ## Per-verb rung-3 classifier eligibility
 *
 * Not every verb benefits from rung-3. From the Step-6 sign-off:
 *
 *   - observe, interact: YES — browser-bound, benefit from real DOM.
 *   - test-compose: NO — pure code generation, no browser involvement.
 *   - facet-mint, facet-enrich, facet-query, locator-health-track: NO —
 *     pure in-memory operations, no DOM.
 *   - intent-fetch: NO — network IO against ADO, not a browser concern.
 *
 * Verbs without rung-3 classifiers fall through to rung-2 in the
 * PlaywrightLiveProbeHarness. The adapter tag stays 'playwright-live'
 * on the receipt, but the classification came from rung-2 logic.
 *
 * ## Substrate-bound type
 *
 * The Page type is `unknown` at the port definition to avoid coupling
 * this module (which is otherwise pure) to @playwright/test at module-
 * import time. Individual classifier implementations narrow to the
 * Playwright Page shape they actually use.
 *
 * Pure port definition; no IO at module load.
 */

import type { Effect } from 'effect';
import type { Probe } from '../../probe-ir';
import type { ProbeOutcome } from '../../probe-receipt';

/** The substrate-bound page handle. Kept as `unknown` at the port
 *  level; individual classifiers cast to the Playwright Page shape
 *  they need. */
export type SubstratePage = unknown;

/** A rung-3 classifier. Given a probe and a substrate page, produces
 *  the observed outcome. Effect return allows errors; per-probe IO
 *  (queries, clicks) happens inside the Effect. */
export interface Rung3Classifier {
  /** Manifest verb name this classifier is keyed by. */
  readonly verb: string;
  /** The classification function. */
  readonly classify: (
    probe: Probe,
    page: SubstratePage,
  ) => Effect.Effect<ProbeOutcome['observed'], Error, never>;
}

/** The registry: verb-keyed map of rung-3 classifiers. Parallels
 *  VerbClassifierRegistry in shape; differs only in the classifier
 *  type (Rung3Classifier vs VerbClassifier). */
export interface Rung3ClassifierRegistry {
  readonly classifiers: ReadonlyMap<string, Rung3Classifier>;
}

export function rung3ClassifierRegistry(
  classifiers: readonly Rung3Classifier[],
): Rung3ClassifierRegistry {
  const map = new Map<string, Rung3Classifier>();
  for (const c of classifiers) map.set(c.verb, c);
  return { classifiers: map };
}

export function lookupRung3Classifier(
  registry: Rung3ClassifierRegistry,
  verb: string,
): Rung3Classifier | null {
  return registry.classifiers.get(verb) ?? null;
}

export const EMPTY_RUNG3_CLASSIFIER_REGISTRY: Rung3ClassifierRegistry = {
  classifiers: new Map(),
};
