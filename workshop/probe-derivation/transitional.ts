/**
 * Transitional probe set — the inline-encoded bridge between the
 * Step 1 reference-canon retirement and the Step 5 manifest-derived
 * probe IR.
 *
 * Per `docs/v2-readiness.md §5` and `docs/v2-direction.md §6 Step 1`,
 * the workshop loses its dogfood input at Step 1 (pre-gate content
 * retires) but needs *something* to measure against during Phase 2
 * (Steps 2–4). This module declares seven probes that exercise v1's
 * existing verbs, facet kinds, and error families — enough coverage
 * to keep the scorecard alive through Phase 2 without standing up a
 * parallel hand-authored corpus.
 *
 * Each probe carries its probe-surface cohort triple in metadata so
 * the re-keyed M5 visitor can group trajectory points correctly.
 *
 * This whole module retires at Step 5 in the same commit that lands
 * the first three per-verb fixture YAMLs for the real probe IR.
 *
 * See `docs/v2-readiness.md §5.3` for the retirement protocol.
 */

import type { ProbeSurfaceCohort } from '../metrics/probe-surface-cohort';

/** Classification of a probe's expected outcome. `'matched'` means
 *  the product verb should produce a resolved result; `'failed'`
 *  means the product verb should emit the declared error family. */
export type TransitionalProbeExpectation = 'matched' | 'failed';

export interface TransitionalProbe {
  /** Stable identity — used for receipt lookup and the source field
   *  on synthesized work items. Format `probe:transitional:<slug>`. */
  readonly id: string;
  /** Human-readable description of the surface being probed. */
  readonly description: string;
  /** The probe-surface cohort key this probe contributes evidence
   *  toward. M5 groups run records by this triple to compute the
   *  memory-maturity trajectory. */
  readonly cohort: ProbeSurfaceCohort;
  /** What the product verb is expected to produce when the probe
   *  runs. `'matched'` for success paths; `'failed'` for paths that
   *  should emit the declared error family. */
  readonly expectation: TransitionalProbeExpectation;
}

/** The seven probes per `docs/v2-readiness.md §5.1`. Covers all four
 *  facet kinds (element, state, route, vocabulary via drift
 *  classification), the primary error family `not-visible`, and the
 *  core verbs v1 already has running code for. */
export const TRANSITIONAL_PROBES: readonly TransitionalProbe[] = [
  {
    id: 'probe:transitional:observe-home-button',
    description: 'Known customer-home button observation',
    cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    expectation: 'matched',
  },
  {
    id: 'probe:transitional:observe-account-detail-state',
    description: 'Account-detail state observation',
    cohort: { verb: 'observe', facetKind: 'state', errorFamily: null },
    expectation: 'matched',
  },
  {
    id: 'probe:transitional:observe-hidden-target',
    description: 'Hidden-target observation (expected to fail with not-visible)',
    cohort: { verb: 'observe', facetKind: 'element', errorFamily: 'not-visible' },
    expectation: 'failed',
  },
  {
    id: 'probe:transitional:navigate-policy-search',
    description: 'Navigate to policy-search URL',
    cohort: { verb: 'navigate', facetKind: 'route', errorFamily: null },
    expectation: 'matched',
  },
  {
    id: 'probe:transitional:facet-query-by-intent',
    description: 'Facet query by intent phrase',
    cohort: { verb: 'facet-query', facetKind: 'element', errorFamily: null },
    expectation: 'matched',
  },
  {
    id: 'probe:transitional:test-compose-3step',
    description: 'Test-compose of simple 3-step work item',
    cohort: { verb: 'test-compose', facetKind: 'element', errorFamily: null },
    expectation: 'matched',
  },
  {
    id: 'probe:transitional:drift-emit-name-change',
    description: 'Drift emit on changed name attribute',
    cohort: { verb: 'drift-emit', facetKind: 'vocabulary', errorFamily: null },
    expectation: 'matched',
  },
];

/** The unique probe-surface cohorts exercised by the transitional
 *  set. Workshop tooling can use this to enumerate the cohorts that
 *  exist at the Step 1 baseline without re-walking the probes. */
export const TRANSITIONAL_COHORTS: readonly ProbeSurfaceCohort[] = (() => {
  const seen = new Set<string>();
  const unique: ProbeSurfaceCohort[] = [];
  for (const probe of TRANSITIONAL_PROBES) {
    const key = `${probe.cohort.verb}:${probe.cohort.facetKind}:${probe.cohort.errorFamily ?? 'none'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(probe.cohort);
  }
  return unique;
})();
