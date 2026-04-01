import { expect, test } from '@playwright/test';
import { bindScenarioStep } from '../lib/domain/governance/binding';
import { parseSnapshotToScenario } from '../lib/application/parse';
import type { AdoSnapshot, ExecutionProfile } from '../lib/domain/types';
import type { AdoId } from '../lib/domain/kernel/identity';

// ─── WP1 Law Tests: Intent-Only Steps + Dogfood Profile ───

function createMinimalSnapshot(overrides: Partial<AdoSnapshot> = {}): AdoSnapshot {
  return {
    id: '99999' as AdoId,
    revision: 1,
    title: 'Novel ADO test case',
    suitePath: 'demo',
    areaPath: 'Tests',
    iterationPath: 'Sprint 1',
    tags: [],
    priority: 2,
    steps: [
      { index: 0, action: 'Navigate to the policy search page', expected: '' },
      { index: 1, action: 'Enter the policy number into search', expected: 'Policy number is accepted' },
      { index: 2, action: 'Click the search button', expected: 'Results are displayed' },
    ],
    parameters: [],
    dataRows: [],
    contentHash: 'sha256:novel-test',
    syncedAt: '2026-03-16T00:00:00.000Z',
    ...overrides,
  };
}

test('intent-only steps preserve raw ADO prose without alias resolution', () => {
  const snapshot = createMinimalSnapshot();
  const scenario = parseSnapshotToScenario(snapshot);

  expect(scenario.steps).toHaveLength(3);
  for (const step of scenario.steps) {
    expect(step.confidence).toBe('intent-only');
    expect(step.action).toBe('custom');
    expect(step.screen).toBeNull();
    expect(step.element).toBeNull();
    expect(step.posture).toBeNull();
    expect(step.resolution).toBeNull();
  }
});

test('intent-only steps bind as deferred with empty reasons', () => {
  const snapshot = createMinimalSnapshot();
  const scenario = parseSnapshotToScenario(snapshot);

  const bound = scenario.steps.map((step) => bindScenarioStep(step, {}));

  for (const step of bound) {
    expect(step.binding.kind).toBe('deferred');
    expect(step.binding.reasons).toEqual([]);
    expect(step.binding.governance).toBe('approved');
  }
});

test('intent-only steps do not produce unbound failures', () => {
  const snapshot = createMinimalSnapshot();
  const scenario = parseSnapshotToScenario(snapshot);

  const bound = scenario.steps.map((step) => bindScenarioStep(step, {}));
  const unboundSteps = bound.filter((step) => step.binding.kind === 'unbound');

  expect(unboundSteps).toHaveLength(0);
});

test('dogfood is a valid ExecutionProfile value', () => {
  const profiles: readonly ExecutionProfile[] = ['interactive', 'ci-batch', 'dogfood'] as const;
  expect(profiles).toContain('dogfood');
  expect(profiles).toHaveLength(3);
});

test('ExecutionProfile type includes all three profiles', () => {
  // Exhaustive assignment test — if a profile is missing from the union, this won't compile
  const assertProfile = (profile: ExecutionProfile): string => {
    switch (profile) {
      case 'interactive': return 'interactive';
      case 'ci-batch': return 'ci-batch';
      case 'dogfood': return 'dogfood';
    }
  };
  expect(assertProfile('interactive')).toBe('interactive');
  expect(assertProfile('ci-batch')).toBe('ci-batch');
  expect(assertProfile('dogfood')).toBe('dogfood');
});

test('intent-only confidence is preserved through parse → bind pipeline', () => {
  const snapshot = createMinimalSnapshot({
    steps: [{ index: 0, action: 'Do something completely novel and unusual with the widget', expected: 'Widget responds' }],
  });
  const scenario = parseSnapshotToScenario(snapshot);
  const step = scenario.steps[0]!;

  expect(step.confidence).toBe('intent-only');
  expect(step.action_text).toContain('Do something completely novel');

  const bound = bindScenarioStep(step, {});
  expect(bound.binding.kind).toBe('deferred');
  expect(bound.binding.normalizedIntent).toContain('do something completely novel');
});
