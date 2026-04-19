import { expect, test } from '@playwright/test';
import {
  oidObligation,
  oidTrajectory,
  scenarioStabilityScore,
  sssObligation,
  type OutcomeHistoryEntry,
} from '../../workshop/metrics/outcome-metrics';

function history(entries: readonly Partial<OutcomeHistoryEntry>[]): readonly OutcomeHistoryEntry[] {
  return entries.map((e, i) => ({
    runAt: e.runAt ?? `2026-04-0${i + 1}T00:00:00.000Z`,
    pipelineVersion: 'test',
    knowledgeHitRate: 0.4,
    translationPrecision: 1,
    convergenceVelocity: 1,
    improved: true,
    ...e,
  }));
}

// ─── OID (Operator Intervention Density) ──────────────────────────

test('oidTrajectory skips entries without operator data', () => {
  const h = history([
    { operatorDecisions: 5, scenarioCount: 5, iterationCount: 1 },
    { /* no operator fields */ },
    { operatorDecisions: 3, scenarioCount: 5, iterationCount: 1 },
  ]);
  const t = oidTrajectory(h);
  expect(t).toHaveLength(2);
});

test('oidTrajectory computes density as decisions / (scenarios × iterations)', () => {
  const h = history([{ operatorDecisions: 10, scenarioCount: 5, iterationCount: 2 }]);
  const t = oidTrajectory(h);
  expect(t[0]!.density).toBe(1); // 10 / (5 * 2)
});

test('OID obligation: insufficient samples → watch + heuristic-proxy', () => {
  const o = oidObligation(history([]));
  expect(o.status).toBe('watch');
  expect(o.measurementClass).toBe('derived');
});

test('OID obligation: decreasing density → healthy + direct (≥3 samples)', () => {
  const h = history([
    { operatorDecisions: 10, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 6, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 2, scenarioCount: 5, iterationCount: 1 },
  ]);
  const o = oidObligation(h);
  expect(o.status).toBe('healthy');
  expect(o.measurementClass).toBe('direct');
  expect(o.evidence).toContain('decreasing');
});

test('OID obligation: rising density → critical', () => {
  const h = history([
    { operatorDecisions: 2, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 10, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 20, scenarioCount: 5, iterationCount: 1 },
  ]);
  const o = oidObligation(h);
  expect(o.status).toBe('critical');
  expect(o.evidence).toContain('increasing');
});

test('OID obligation: flat density → healthy', () => {
  const h = history([
    { operatorDecisions: 5, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 5, scenarioCount: 5, iterationCount: 1 },
    { operatorDecisions: 5, scenarioCount: 5, iterationCount: 1 },
  ]);
  const o = oidObligation(h);
  expect(o.status).toBe('healthy');
  expect(o.evidence).toContain('flat');
});

// ─── SSS (Scenario Stability Score) ───────────────────────────────

test('SSS with no scenario rung data → healthy baseline', () => {
  const h = history([{}, {}]);
  expect(scenarioStabilityScore(h)).toBe(1);
});

test('SSS: all scenarios stable at best rung → 1.0', () => {
  const h = history([
    { scenarioRungs: { A: 2, B: 3 } },
    { scenarioRungs: { A: 2, B: 3 } },
    { scenarioRungs: { A: 2, B: 3 } },
  ]);
  expect(scenarioStabilityScore(h)).toBe(1);
});

test('SSS: scenario regresses from rung 2 → rung 5 → drops', () => {
  const h = history([
    { scenarioRungs: { A: 2 } }, // best rung for A is 2
    { scenarioRungs: { A: 5 } }, // regressed
  ]);
  const score = scenarioStabilityScore(h);
  expect(score).toBe(0); // 0/1 stable
});

test('SSS: half the scenarios regress → 0.5', () => {
  const h = history([
    { scenarioRungs: { A: 2, B: 2 } },
    { scenarioRungs: { A: 2, B: 8 } }, // B regressed, A stable
  ]);
  expect(scenarioStabilityScore(h)).toBe(0.5);
});

test('SSS: improvement (lower rung index) also counts as stable', () => {
  const h = history([
    { scenarioRungs: { A: 5 } }, // starts at rung 5
    { scenarioRungs: { A: 2 } }, // improved to rung 2
  ]);
  expect(scenarioStabilityScore(h)).toBe(1);
});

test('sssObligation: <2 annotated → healthy baseline + derived', () => {
  const o = sssObligation(history([]));
  expect(o.status).toBe('healthy');
  expect(o.score).toBe(1);
  expect(o.measurementClass).toBe('derived');
});

test('sssObligation: 3 annotated runs with stable scenarios → direct + healthy', () => {
  const h = history([
    { scenarioRungs: { A: 2, B: 3, C: 2 } },
    { scenarioRungs: { A: 2, B: 3, C: 2 } },
    { scenarioRungs: { A: 2, B: 3, C: 2 } },
  ]);
  const o = sssObligation(h);
  expect(o.measurementClass).toBe('direct');
  expect(o.status).toBe('healthy');
  expect(o.score).toBe(1);
});

test('sssObligation: silent regression → critical', () => {
  const h = history([
    { scenarioRungs: { A: 2, B: 2, C: 2, D: 2 } },
    { scenarioRungs: { A: 2, B: 2, C: 2, D: 2 } },
    { scenarioRungs: { A: 8, B: 8, C: 8, D: 2 } }, // 3 of 4 regressed
  ]);
  const o = sssObligation(h);
  expect(o.status).toBe('critical');
  expect(o.score).toBe(0.25);
});
