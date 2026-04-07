/**
 * Reference cohort definitions — the canonical 12-cohort suite the
 * fifth-kind loop uses as the frozen workload for pipeline measurement.
 *
 * Each cohort declares a (cohortId, idStart, count, perturbation,
 * archetypePreference, seedSuffix) tuple. The cohort orchestrator
 * iterates this list, calls `planSyntheticScenarios()` once per cohort,
 * and writes the result to `dogfood/scenarios/reference/{cohortId}/`.
 *
 * ID ranges are non-overlapping by construction: cohort N occupies
 * `[20000 + N*20, 20000 + (N+1)*20)`. Twelve cohorts × 20 scenarios
 * each = 240 reference scenarios occupying `[20000, 20240)`.
 *
 * Adding a new cohort:
 *   1. Append a new entry to `REFERENCE_COHORTS` below.
 *   2. Pick the next contiguous ID range.
 *   3. Choose a perturbation profile and (optionally) an archetype bias.
 *   4. The orchestrator picks it up automatically — no other changes
 *      needed.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { CohortDefinition } from './cohort-plan';
import type { PerturbationConfig } from './scenario-plan';

// ─── Per-axis perturbation primitives ─────────────────────────────

const ZERO: PerturbationConfig = {
  lexicalGap: 0,
  dataVariation: 0,
  coverageGap: 0,
  crossScreen: 0,
};

const cohortCount = 20;

function range(index: number): { idStart: number; count: number } {
  return { idStart: 20000 + index * cohortCount, count: cohortCount };
}

// ─── The 12 reference cohorts ─────────────────────────────────────
//
// Ordering matters: it determines the ID range each cohort occupies.
// Do not reorder without also re-snapshotting the manifest.

export const REFERENCE_COHORTS: readonly CohortDefinition[] = [
  // 0 ─ Baseline. No perturbation. Tests the floor: every step should
  // resolve via approved knowledge with no surprises.
  {
    cohortId: 'baseline-zero',
    description: 'No perturbation across any axis. Establishes the success floor.',
    ...range(0),
    perturbation: ZERO,
    seedSuffix: 'baseline',
  },

  // 1 ─ Mild lexical drift. The first thing operators encounter in
  // production is vocabulary drift; this cohort calibrates pipeline
  // sensitivity at the gentle end.
  {
    cohortId: 'lexical-low',
    description: 'lexicalGap=0.3 — mild vocabulary drift, other axes zero.',
    ...range(1),
    perturbation: { ...ZERO, lexicalGap: 0.3 },
    seedSuffix: 'lex-low',
  },

  // 2 ─ Heavy lexical drift. Stresses translation, alias coverage, and
  // pattern promotion.
  {
    cohortId: 'lexical-high',
    description: 'lexicalGap=0.8 — held-out domain vocabulary, near-maximum gap.',
    ...range(2),
    perturbation: { ...ZERO, lexicalGap: 0.8 },
    seedSuffix: 'lex-high',
  },

  // 3 ─ Data variation. Same intent surfaces, different data values.
  // Tests posture handling and data binding.
  {
    cohortId: 'data-variation',
    description: 'dataVariation=0.7 — varied data values across canonical surfaces.',
    ...range(3),
    perturbation: { ...ZERO, dataVariation: 0.7 },
    seedSuffix: 'data-var',
  },

  // 4 ─ Coverage gaps. Some required steps dropped. Tests recovery
  // strategy selection and degraded resolution.
  {
    cohortId: 'coverage-gaps',
    description: 'coverageGap=0.4 — required steps occasionally dropped.',
    ...range(4),
    perturbation: { ...ZERO, coverageGap: 0.4 },
    seedSuffix: 'coverage',
  },

  // 5 ─ Cross-screen journeys. Multi-screen flow stress test.
  {
    cohortId: 'cross-screen',
    description: 'crossScreen=0.6 — multi-screen journey archetypes.',
    ...range(5),
    perturbation: { ...ZERO, crossScreen: 0.6 },
    seedSuffix: 'xscreen',
  },

  // 6 ─ Archetype-mix uniform. Equal weights across all archetypes.
  // Tests breadth — every archetype gets representation.
  {
    cohortId: 'archetype-mix',
    description: 'Equal archetype weights — uniform breadth across all 5 patterns.',
    ...range(6),
    perturbation: { ...ZERO, lexicalGap: 0.2 },
    archetypePreference: {
      weights: {
        'search-verify': 1,
        'detail-inspect': 1,
        'cross-screen-journey': 1,
        'form-submit': 1,
        'read-only-audit': 1,
      },
    },
    seedSuffix: 'arch-mix',
  },

  // 7 ─ Search-heavy. Biases toward search-verify pattern. Tests
  // single-archetype depth.
  {
    cohortId: 'search-heavy',
    description: '80% search-verify, 20% detail-inspect — search pattern depth.',
    ...range(7),
    perturbation: { ...ZERO, lexicalGap: 0.3 },
    archetypePreference: {
      weights: { 'search-verify': 4, 'detail-inspect': 1 },
    },
    seedSuffix: 'search',
  },

  // 8 ─ Detail-heavy. Biases toward detail-inspect. Counterpart depth
  // probe to search-heavy.
  {
    cohortId: 'detail-heavy',
    description: '80% detail-inspect, 20% read-only-audit — detail pattern depth.',
    ...range(8),
    perturbation: { ...ZERO, lexicalGap: 0.3 },
    archetypePreference: {
      weights: { 'detail-inspect': 4, 'read-only-audit': 1 },
    },
    seedSuffix: 'detail',
  },

  // 9 ─ High stress. All axes near maximum. The pipeline's hardest
  // workload — useful for catching catastrophic regressions.
  {
    cohortId: 'high-stress',
    description: 'Maximum perturbation across all axes — catastrophic-regression detector.',
    ...range(9),
    perturbation: {
      lexicalGap: 0.7,
      dataVariation: 0.6,
      coverageGap: 0.3,
      crossScreen: 0.4,
    },
    seedSuffix: 'stress',
  },

  // 10 ─ Drift-only. Lexical + data variation, no coverage gaps. Tests
  // the pipeline's vocabulary muscles in isolation from recovery.
  {
    cohortId: 'drift-only',
    description: 'lexicalGap=0.6, dataVariation=0.5, no coverage gaps — vocabulary stress.',
    ...range(10),
    perturbation: {
      lexicalGap: 0.6,
      dataVariation: 0.5,
      coverageGap: 0,
      crossScreen: 0,
    },
    seedSuffix: 'drift',
  },

  // 11 ─ Cross-screen heavy. Large crossScreen + multi-archetype mix.
  // The journey-stress probe.
  {
    cohortId: 'cross-screen-heavy',
    description: 'crossScreen=0.8 + uniform archetype weights — multi-screen journey stress.',
    ...range(11),
    perturbation: { ...ZERO, lexicalGap: 0.3, crossScreen: 0.8 },
    archetypePreference: {
      weights: {
        'search-verify': 1,
        'detail-inspect': 1,
        'cross-screen-journey': 3,
        'form-submit': 1,
        'read-only-audit': 1,
      },
    },
    seedSuffix: 'xscreen-heavy',
  },
];

/** Total scenario count when all reference cohorts are generated. */
export const REFERENCE_COHORT_TOTAL: number = REFERENCE_COHORTS.reduce(
  (acc, cohort) => acc + cohort.count,
  0,
);
