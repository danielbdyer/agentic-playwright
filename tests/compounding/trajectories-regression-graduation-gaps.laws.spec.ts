/**
 * Z5b — trajectories + regression + graduation + gaps laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.5:
 *   ZC20 computeTrajectories groups by cohort.
 *   ZC21 regression diff (newlyFailing / newlyPassing) correct.
 *   ZC22 ratchet break detection.
 *   ZC23 graduation conditions in stable order.
 *   ZC24 gap-analysis probe + scenario gaps.
 *   ZC25 (integration) computeScoreboard end-to-end under
 *        in-memory services produces valid CompoundingScoreboard.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  hypothesisId,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import type { Cohort } from '../../workshop/compounding/domain/cohort';
import { cohortKey } from '../../workshop/compounding/domain/cohort';
import { computeTrajectories } from '../../workshop/compounding/application/trajectories';
import { computeRegressionReport } from '../../workshop/compounding/application/regression';
import { computeGraduationGate } from '../../workshop/compounding/application/graduation';
import { computeGapReport } from '../../workshop/compounding/application/gap-analysis';
import { computeScoreboard } from '../../workshop/compounding/application/compute-scoreboard';
import type { HypothesisReceipt } from '../../workshop/compounding/domain/hypothesis-receipt';
import type { Ratchet } from '../../workshop/compounding/domain/ratchet';
import type { Trajectory } from '../../workshop/compounding/domain/trajectory';
import type {
  ProbeReceiptLike,
  ScenarioReceiptLike,
} from '../../workshop/compounding/application/ports';
import { inMemoryCompoundingLayer } from '../../workshop/compounding/composition/in-memory-services';
import { GRADUATION_CONDITIONS } from '../../workshop/compounding/domain/graduation';
import { asFingerprint } from '../../product/domain/kernel/hash';

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');

function h(id: string, cohort: Cohort): Hypothesis {
  return {
    id: hypothesisId(id),
    description: `hypothesis-${id}`,
    schemaVersion: 1,
    cohort,
    prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 1 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test',
    createdAt: PINNED_NOW.toISOString(),
  };
}

function hr(params: {
  readonly hypothesisId: string;
  readonly computedAt?: string;
  readonly confirmed?: number;
  readonly refuted?: number;
  readonly outcome?: 'confirmed' | 'refuted' | 'inconclusive';
}): HypothesisReceipt {
  const confirmed = params.confirmed ?? 9;
  const refuted = params.refuted ?? 1;
  return {
    version: 1,
    stage: 'evidence',
    scope: 'hypothesis',
    kind: 'hypothesis-receipt',
    ids: {},
    fingerprints: { artifact: `fp:hr:${params.hypothesisId}:${params.computedAt ?? PINNED_NOW.toISOString()}` },
    lineage: { sources: [], parents: [], handshakes: ['evidence'], experimentIds: [] },
    governance: 'approved',
    payload: {
      hypothesisId: hypothesisId(params.hypothesisId),
      hypothesisFingerprint: asFingerprint('hypothesis', `fp:h:${params.hypothesisId}`),
      outcome: params.outcome ?? (confirmed >= 9 * (confirmed + refuted) / 10 ? 'confirmed' : 'refuted'),
      evidenceReceiptIds: [],
      confirmedCount: confirmed,
      refutedCount: refuted,
      inconclusiveCount: 0,
      cycleRate: confirmed / (confirmed + refuted),
      provenance: {
        substrateVersion: '1.0.0',
        manifestVersion: 1,
        computedAt: params.computedAt ?? PINNED_NOW.toISOString(),
      },
    },
  };
}

function pr(params: {
  readonly hypothesisId: string | null;
  readonly artifact: string;
  readonly pass: boolean;
  readonly verb?: string;
  readonly facetKind?: string;
}): ProbeReceiptLike {
  return {
    payload: {
      probeId: `probe:${params.artifact}`,
      verb: params.verb ?? 'observe',
      fixtureName: params.artifact,
      hypothesisId: params.hypothesisId,
      outcome: {
        expected: { classification: 'matched', errorFamily: null },
        observed: {
          classification: params.pass ? 'matched' : 'failed',
          errorFamily: params.pass ? null : 'not-visible',
        },
        completedAsExpected: params.pass,
      },
      cohort: {
        verb: params.verb ?? 'observe',
        facetKind: params.facetKind ?? 'element',
        errorFamily: null,
      },
    },
    fingerprints: { artifact: params.artifact },
  };
}

function sr(params: {
  readonly hypothesisId: string | null;
  readonly artifact: string;
  readonly verdict?: string;
  readonly scenarioId?: string;
}): ScenarioReceiptLike {
  return {
    payload: {
      scenarioId: params.scenarioId ?? params.artifact,
      hypothesisId: params.hypothesisId,
      verdict: params.verdict ?? 'trajectory-holds',
    },
    fingerprints: { artifact: params.artifact },
  };
}

const COHORT_A: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
};
const COHORT_B: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'interact', facetKind: 'element', errorFamily: null },
};

describe('Z5b — computeTrajectories (ZC20)', () => {
  test('ZC20: groups receipts by cohort', () => {
    const hypotheses = [h('h-a', COHORT_A), h('h-b', COHORT_B)];
    const receipts = [
      hr({ hypothesisId: 'h-a', computedAt: '2026-04-01T00:00:00.000Z' }),
      hr({ hypothesisId: 'h-a', computedAt: '2026-04-02T00:00:00.000Z' }),
      hr({ hypothesisId: 'h-b', computedAt: '2026-04-01T00:00:00.000Z' }),
    ];
    const trajectories = computeTrajectories(hypotheses, receipts);
    expect(trajectories).toHaveLength(2);
    const a = trajectories.find((t) => t.cohortId === cohortKey(COHORT_A));
    const b = trajectories.find((t) => t.cohortId === cohortKey(COHORT_B));
    expect(a?.entries).toHaveLength(2);
    expect(b?.entries).toHaveLength(1);
  });

  test('ZC20.b: entries sorted by timestamp ascending', () => {
    const hypotheses = [h('h-a', COHORT_A)];
    const receipts = [
      hr({ hypothesisId: 'h-a', computedAt: '2026-04-02T00:00:00.000Z' }),
      hr({ hypothesisId: 'h-a', computedAt: '2026-04-01T00:00:00.000Z' }),
      hr({ hypothesisId: 'h-a', computedAt: '2026-04-03T00:00:00.000Z' }),
    ];
    const trajectories = computeTrajectories(hypotheses, receipts);
    const times = trajectories[0]!.entries.map((e) => e.timestamp);
    expect(times).toEqual([
      '2026-04-01T00:00:00.000Z',
      '2026-04-02T00:00:00.000Z',
      '2026-04-03T00:00:00.000Z',
    ]);
  });
});

describe('Z5b — computeRegressionReport (ZC21, ZC22)', () => {
  test('ZC21: newlyFailing + newlyPassing correctly diff', () => {
    const priorPassing = new Set(['fp:a', 'fp:b', 'fp:c']);
    const probes = [
      pr({ hypothesisId: null, artifact: 'fp:a', pass: true }),
      pr({ hypothesisId: null, artifact: 'fp:b', pass: false }),
      pr({ hypothesisId: null, artifact: 'fp:d', pass: true }),
    ];
    const report = computeRegressionReport({
      priorPassing,
      baselineFingerprint: 'base',
      currentFingerprint: 'curr',
      probeReceipts: probes,
      scenarioReceipts: [],
      ratchets: [],
      now: () => PINNED_NOW,
    });
    expect(report.newlyFailing).toEqual(['fp:b']);
    expect(report.newlyPassing).toEqual(['fp:d']);
  });

  test('ZC22: ratchet break when scenario fingerprint is no longer passing', () => {
    const priorPassing = new Set(['fp:sr:demo']);
    const ratchet: Ratchet = {
      id: 'ratchet:demo',
      scenarioId: 'demo',
      firstPassedAt: '2026-01-01T00:00:00.000Z',
      firstPassedFingerprint: 'fp:sr:demo',
    };
    const scenarios = [sr({ hypothesisId: null, artifact: 'fp:sr:demo', verdict: 'step-diverged' })];
    const report = computeRegressionReport({
      priorPassing,
      baselineFingerprint: 'base',
      currentFingerprint: 'curr',
      probeReceipts: [],
      scenarioReceipts: scenarios,
      ratchets: [ratchet],
      now: () => PINNED_NOW,
    });
    expect(report.ratchetBreaks).toHaveLength(1);
    expect(report.ratchetBreaks[0]!.ratchetId).toBe('ratchet:demo');
    expect(report.ratchetBreaks[0]!.scenarioId).toBe('demo');
  });

  test('ZC22.b: ratchet intact when scenario still passes', () => {
    const ratchet: Ratchet = {
      id: 'ratchet:demo',
      scenarioId: 'demo',
      firstPassedAt: '2026-01-01T00:00:00.000Z',
      firstPassedFingerprint: 'fp:sr:demo',
    };
    const scenarios = [sr({ hypothesisId: null, artifact: 'fp:sr:demo', verdict: 'trajectory-holds' })];
    const report = computeRegressionReport({
      priorPassing: new Set(['fp:sr:demo']),
      baselineFingerprint: 'base',
      currentFingerprint: 'curr',
      probeReceipts: [],
      scenarioReceipts: scenarios,
      ratchets: [ratchet],
      now: () => PINNED_NOW,
    });
    expect(report.ratchetBreaks).toHaveLength(0);
  });
});

describe('Z5b — computeGraduationGate (ZC23)', () => {
  const FULL_TRAJ: Trajectory = {
    cohortId: 'probe-surface:verb:observe|facet-kind:element|error-family:none',
    entries: [
      {
        cohortId: 'probe-surface:verb:observe|facet-kind:element|error-family:none',
        timestamp: '2026-04-01T00:00:00.000Z',
        sampleSize: 10,
        confirmedCount: 9,
        refutedCount: 1,
        rate: 0.9,
        substrateVersion: '1.0.0',
      },
    ],
  };

  test('ZC23: holds iff all four conditions hold', () => {
    const report = computeGraduationGate({
      probeCoverageRatio: 1,
      scenarioPassRatio: 1,
      trajectories: [FULL_TRAJ],
      regression: {
        baselineFingerprint: '',
        currentFingerprint: '',
        newlyFailing: [],
        newlyPassing: [],
        ratchetBreaks: [],
      },
      confirmationRateFloor: 0.8,
      confirmationRateWindow: 10,
      priorHolds: false,
    });
    expect(report.state).toBe('holds');
    expect(report.missingConditions).toEqual([]);
  });

  test('ZC23.b: missing conditions listed in GRADUATION_CONDITIONS order', () => {
    const report = computeGraduationGate({
      probeCoverageRatio: 0.5,
      scenarioPassRatio: 0.5,
      trajectories: [],
      regression: null,
      confirmationRateFloor: 0.8,
      confirmationRateWindow: 10,
      priorHolds: false,
    });
    expect(report.state).toBe('not-yet');
    // Order matches GRADUATION_CONDITIONS; empty trajectories fail
    // the rate gate; no regression means no ratchet break.
    expect(report.missingConditions).toEqual([
      GRADUATION_CONDITIONS[0],
      GRADUATION_CONDITIONS[1],
      GRADUATION_CONDITIONS[2],
    ]);
  });

  test('ZC23.c: regressed when prior held but now missing', () => {
    const report = computeGraduationGate({
      probeCoverageRatio: 0.9,
      scenarioPassRatio: 1,
      trajectories: [FULL_TRAJ],
      regression: null,
      confirmationRateFloor: 0.8,
      confirmationRateWindow: 10,
      priorHolds: true,
    });
    expect(report.state).toBe('regressed');
  });
});

describe('Z5b — computeGapReport (ZC24)', () => {
  test('ZC24: probe gaps name uncovered (verb, facetKind, errorFamily) triples', () => {
    const report = computeGapReport({
      probeTargets: [
        { verb: 'observe', facetKind: 'element', errorFamily: null },
        { verb: 'interact', facetKind: 'element', errorFamily: 'not-enabled' },
      ],
      scenarioTargets: [],
      probeReceipts: [pr({ hypothesisId: null, artifact: 'fp:x', pass: true })],
      scenarioReceipts: [],
      now: () => PINNED_NOW,
    });
    expect(report.probeGaps).toHaveLength(1);
    expect(report.probeGaps[0]).toEqual({
      verb: 'interact',
      facetKind: 'element',
      errorFamily: 'not-enabled',
    });
  });

  test('ZC24.b: scenario gaps name topologies + uncovered invariants', () => {
    const report = computeGapReport({
      probeTargets: [],
      scenarioTargets: [
        {
          topologyId: 'login-form',
          requiredInvariants: ['validation-errors-clear-on-correction'],
          passingScenarioIds: ['form-success-recovery'],
        },
      ],
      probeReceipts: [],
      scenarioReceipts: [],
      // Invariants-held map is empty — the passing scenario didn't
      // report the required invariant, so it counts as a gap.
      invariantsHeldByScenario: new Map(),
      now: () => PINNED_NOW,
    });
    expect(report.scenarioGaps).toHaveLength(1);
    expect(report.scenarioGaps[0]!.topologyId).toBe('login-form');
    expect(report.scenarioGaps[0]!.uncoveredInvariants).toEqual([
      'validation-errors-clear-on-correction',
    ]);
  });

  test('ZC24.c: no gaps when every target is covered', () => {
    const report = computeGapReport({
      probeTargets: [{ verb: 'observe', facetKind: 'element', errorFamily: null }],
      scenarioTargets: [],
      probeReceipts: [pr({ hypothesisId: null, artifact: 'fp:x', pass: true })],
      scenarioReceipts: [],
      now: () => PINNED_NOW,
    });
    expect(report.probeGaps).toEqual([]);
    expect(report.scenarioGaps).toEqual([]);
  });
});

describe('Z5b — computeScoreboard end-to-end integration (ZC25)', () => {
  test('ZC25: end-to-end compute under in-memory services produces a valid scoreboard', async () => {
    const layer = inMemoryCompoundingLayer({
      hypotheses: [h('h-a', COHORT_A)],
      probeReceipts: [
        pr({ hypothesisId: 'h-a', artifact: 'fp:1', pass: true }),
        pr({ hypothesisId: 'h-a', artifact: 'fp:2', pass: true }),
      ],
      scenarioReceipts: [sr({ hypothesisId: 'h-a', artifact: 'fp:s1', verdict: 'trajectory-holds' })],
      ratchets: [],
    });
    const scoreboard = await Effect.runPromise(
      computeScoreboard({ now: () => PINNED_NOW }).pipe(Effect.provide(layer)),
    );
    expect(scoreboard.generatedAt).toBe(PINNED_NOW.toISOString());
    expect(scoreboard.probeCoverageRatio).toBe(1);
    expect(scoreboard.scenarioPassRatio).toBe(1);
    expect(scoreboard.trajectories).toHaveLength(1);
    expect(scoreboard.graduation.state).toBe('holds');
    expect(scoreboard.activeRatchetCount).toBe(0);
    expect(scoreboard.substrateVersion).toBeTruthy();
  });

  test('ZC25.b: scoreboard is not-yet when hypothesis evidence shows refutation', async () => {
    const layer = inMemoryCompoundingLayer({
      hypotheses: [h('h-a', COHORT_A)],
      probeReceipts: [
        pr({ hypothesisId: 'h-a', artifact: 'fp:1', pass: false }),
        pr({ hypothesisId: 'h-a', artifact: 'fp:2', pass: false }),
      ],
      scenarioReceipts: [sr({ hypothesisId: 'h-a', artifact: 'fp:s1', verdict: 'step-diverged' })],
      ratchets: [],
    });
    const scoreboard = await Effect.runPromise(
      computeScoreboard({
        now: () => PINNED_NOW,
        confirmationRateFloor: 0.9,
        confirmationRateWindow: 10,
      }).pipe(Effect.provide(layer)),
    );
    expect(scoreboard.graduation.state).toBe('not-yet');
    expect(scoreboard.graduation.missingConditions.length).toBeGreaterThan(0);
  });
});
