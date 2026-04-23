/**
 * Compounding domain — Z1a laws (hypothesis + prediction + cohort).
 *
 * Per docs/v2-compounding-engine-plan.md §9.1, the Z1a phase pins:
 *
 *   ZC1 (Hypothesis key stability): hypothesisKeyableShape excludes
 *       cosmetic fields; same substantive fields → same keyable shape.
 *   ZC2 (Prediction closed union): foldPrediction routes every kind.
 *   ZC3 (Cohort key derivation): cohortKey is deterministic; same
 *       inputs → same key; different kinds → differently-prefixed keys.
 *
 * Step 11 Z11a.1 extensions:
 *
 *   ZC2.c (intervention-fidelity routing): foldPrediction dispatches
 *       the new prediction kind to its branch.
 *   ZC3.f (customer-compilation routing): foldCohort dispatches the
 *       new cohort variant to its branch.
 *   ZC3.g (customer-compilation cohortKey): keys are deterministic
 *       per corpus and differ between the two corpuses.
 *
 * ZC4–ZC9 + ZC9.b land in Z1b alongside the runtime evidence types
 * and the domain-purity filesystem walk.
 */

import { describe, test, expect } from 'vitest';
import {
  hypothesisId,
  hypothesisKeyableShape,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import {
  foldPrediction,
  type ConfirmationRatePrediction,
  type CoverageGrowthPrediction,
  type InterventionFidelityPrediction,
  type Prediction,
  type ReceiptFamilyShiftPrediction,
  type RegressionFreedomPrediction,
} from '../../workshop/compounding/domain/prediction';
import {
  cohortKey,
  foldCohort,
  type Cohort,
  type CustomerCompilationCohort,
} from '../../workshop/compounding/domain/cohort';

const SAMPLE_PROBE_COHORT: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'observe', facetKind: 'element', errorFamily: 'not-visible' },
};

const SAMPLE_SCENARIO_COHORT: Cohort = {
  kind: 'scenario-trajectory',
  scenarioId: 'form-success-recovery',
  topologyId: 'login-form',
};

const SAMPLE_RESOLVABLE_COHORT: CustomerCompilationCohort = {
  kind: 'customer-compilation',
  corpus: 'resolvable',
};

const SAMPLE_NEEDS_HUMAN_COHORT: CustomerCompilationCohort = {
  kind: 'customer-compilation',
  corpus: 'needs-human',
};

function sampleHypothesis(): Hypothesis {
  return {
    id: hypothesisId('00000000-0000-4000-8000-000000000001'),
    description: 'observe should matched-confirm against login-form',
    schemaVersion: 1,
    cohort: SAMPLE_PROBE_COHORT,
    prediction: {
      kind: 'confirmation-rate',
      atLeast: 0.9,
      overCycles: 5,
    },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test-fixture',
    createdAt: '2026-04-23T00:00:00.000Z',
  };
}

describe('Compounding domain Z1a — hypothesis + prediction + cohort', () => {
  test('ZC1: hypothesisKeyableShape excludes description, author, createdAt', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = {
      ...a,
      description: 'totally different prose, same hypothesis',
      author: 'different-author',
      createdAt: '2099-12-31T23:59:59.999Z',
    };
    expect(hypothesisKeyableShape(a)).toEqual(hypothesisKeyableShape(b));
    // Same input → same shape across calls.
    expect(hypothesisKeyableShape(a)).toEqual(hypothesisKeyableShape(a));
  });

  test('ZC1.b: hypothesisKeyableShape includes substantive fields', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = {
      ...a,
      prediction: { ...(a.prediction as ConfirmationRatePrediction), atLeast: 0.95 },
    };
    expect(hypothesisKeyableShape(a)).not.toEqual(hypothesisKeyableShape(b));
  });

  test('ZC1.c: hypothesisKeyableShape distinguishes cohorts', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = { ...a, cohort: SAMPLE_SCENARIO_COHORT };
    expect(hypothesisKeyableShape(a)).not.toEqual(hypothesisKeyableShape(b));
  });

  test('ZC1.d: hypothesisKeyableShape distinguishes supersedes chain position', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = { ...a, supersedes: hypothesisId('earlier-id') };
    expect(hypothesisKeyableShape(a)).not.toEqual(hypothesisKeyableShape(b));
  });

  test('ZC2: foldPrediction routes every kind', () => {
    const predictions: Prediction[] = [
      { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 3 } satisfies ConfirmationRatePrediction,
      { kind: 'receipt-family-shift', from: 'not-visible', to: 'matched' } satisfies ReceiptFamilyShiftPrediction,
      { kind: 'coverage-growth', verb: 'observe', facetKind: 'element', fromRatio: 0.5, toRatio: 0.9 } satisfies CoverageGrowthPrediction,
      { kind: 'regression-freedom', receiptIds: ['r1', 'r2'] } satisfies RegressionFreedomPrediction,
      { kind: 'intervention-fidelity', atLeast: 0.9, overCycles: 3 } satisfies InterventionFidelityPrediction,
    ];
    const tags = predictions.map((p) =>
      foldPrediction(p, {
        confirmationRate: () => 'cr',
        receiptFamilyShift: () => 'rfs',
        coverageGrowth: () => 'cg',
        regressionFreedom: () => 'rf',
        interventionFidelity: () => 'if',
      }),
    );
    expect(tags).toEqual(['cr', 'rfs', 'cg', 'rf', 'if']);
  });

  test('ZC2.b: foldPrediction forwards payload to the matched branch', () => {
    const p: Prediction = { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 5 };
    const summary = foldPrediction(p, {
      confirmationRate: (pr) => `${pr.atLeast}@${pr.overCycles}`,
      receiptFamilyShift: () => 'nope',
      coverageGrowth: () => 'nope',
      regressionFreedom: () => 'nope',
      interventionFidelity: () => 'nope',
    });
    expect(summary).toBe('0.8@5');
  });

  test('ZC2.c: foldPrediction forwards intervention-fidelity payload', () => {
    const p: Prediction = { kind: 'intervention-fidelity', atLeast: 0.85, overCycles: 3 };
    const summary = foldPrediction(p, {
      confirmationRate: () => 'nope',
      receiptFamilyShift: () => 'nope',
      coverageGrowth: () => 'nope',
      regressionFreedom: () => 'nope',
      interventionFidelity: (pr) => `fidelity:${pr.atLeast}@${pr.overCycles}`,
    });
    expect(summary).toBe('fidelity:0.85@3');
  });

  test('ZC3: cohortKey is deterministic on probe-surface', () => {
    const a = cohortKey(SAMPLE_PROBE_COHORT);
    const b = cohortKey({ ...SAMPLE_PROBE_COHORT });
    expect(a).toBe(b);
    expect(a).toMatch(/^probe-surface:/);
  });

  test('ZC3.b: cohortKey is deterministic on scenario-trajectory', () => {
    const a = cohortKey(SAMPLE_SCENARIO_COHORT);
    const b = cohortKey({ ...SAMPLE_SCENARIO_COHORT });
    expect(a).toBe(b);
    expect(a).toBe('scenario:form-success-recovery|topology:login-form');
  });

  test('ZC3.c: cohortKey distinguishes differently-keyed cohorts of the same kind', () => {
    const a: Cohort = {
      kind: 'probe-surface',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: 'not-visible' },
    };
    const b: Cohort = {
      kind: 'probe-surface',
      cohort: { verb: 'interact', facetKind: 'element', errorFamily: 'not-visible' },
    };
    expect(cohortKey(a)).not.toBe(cohortKey(b));
  });

  test('ZC3.d: cohortKey prefixes differ between probe-surface and scenario-trajectory', () => {
    const p = cohortKey(SAMPLE_PROBE_COHORT);
    const s = cohortKey(SAMPLE_SCENARIO_COHORT);
    expect(p.startsWith('probe-surface:')).toBe(true);
    expect(s.startsWith('scenario:')).toBe(true);
    expect(p).not.toBe(s);
  });

  test('ZC3.e: foldCohort routes every variant', () => {
    const tag = foldCohort(SAMPLE_PROBE_COHORT, {
      probeSurface: () => 'ps',
      scenarioTrajectory: () => 'st',
      customerCompilation: () => 'cc',
    });
    expect(tag).toBe('ps');
    const tag2 = foldCohort(SAMPLE_SCENARIO_COHORT, {
      probeSurface: () => 'ps',
      scenarioTrajectory: () => 'st',
      customerCompilation: () => 'cc',
    });
    expect(tag2).toBe('st');
    const tag3 = foldCohort(SAMPLE_RESOLVABLE_COHORT, {
      probeSurface: () => 'ps',
      scenarioTrajectory: () => 'st',
      customerCompilation: (c) => `cc:${c.corpus}`,
    });
    expect(tag3).toBe('cc:resolvable');
  });

  test('ZC3.f: customer-compilation cohortKey is deterministic per corpus', () => {
    const a = cohortKey(SAMPLE_RESOLVABLE_COHORT);
    const b = cohortKey({ ...SAMPLE_RESOLVABLE_COHORT });
    expect(a).toBe(b);
    expect(a).toBe('customer-compilation:corpus:resolvable');
  });

  test('ZC3.g: customer-compilation cohortKey distinguishes the two corpuses', () => {
    const r = cohortKey(SAMPLE_RESOLVABLE_COHORT);
    const n = cohortKey(SAMPLE_NEEDS_HUMAN_COHORT);
    expect(r).not.toBe(n);
    expect(n).toBe('customer-compilation:corpus:needs-human');
  });
});
