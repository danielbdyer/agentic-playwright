import { expect, test } from '@playwright/test';
import { computeMarginalValue } from '../lib/domain/rung-stress';
import type { RungStressStepResult } from '../lib/domain/types/execution';

// ─── Helpers ───

function makeStep(overrides: Partial<RungStressStepResult> & { readonly stepIndex: number }): RungStressStepResult {
  return {
    resolvedWithForce: false,
    resolvedWithBaseline: false,
    degradedFromBaseline: false,
    rungConfidence: 0,
    ...overrides,
  };
}

// ─── Marginal Value Computation ───

test('empty step results yield redundant verdict', () => {
  const result = computeMarginalValue('explicit', []);
  expect(result.verdict).toBe('redundant');
  expect(result.resolutionRate).toBe(0);
  expect(result.degradationRate).toBe(0);
  expect(result.avgConfidence).toBe(0);
  expect(result.uniqueResolutions).toBe(0);
  expect(result.rung).toBe('explicit');
});

test('all steps resolved with unique resolutions yield essential verdict', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: true, resolvedWithBaseline: false, rungConfidence: 0.9 }),
    makeStep({ stepIndex: 1, resolvedWithForce: true, resolvedWithBaseline: false, rungConfidence: 0.85 }),
    makeStep({ stepIndex: 2, resolvedWithForce: true, resolvedWithBaseline: false, rungConfidence: 0.95 }),
  ];
  const result = computeMarginalValue('approved-screen-knowledge', steps);
  expect(result.verdict).toBe('essential');
  expect(result.resolutionRate).toBe(1);
  expect(result.uniqueResolutions).toBe(3);
  expect(result.avgConfidence).toBeCloseTo(0.9, 5);
});

test('high resolution rate but no unique resolutions yields valuable not essential', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: true, resolvedWithBaseline: true, rungConfidence: 0.9 }),
    makeStep({ stepIndex: 1, resolvedWithForce: true, resolvedWithBaseline: true, rungConfidence: 0.85 }),
    makeStep({ stepIndex: 2, resolvedWithForce: true, resolvedWithBaseline: true, rungConfidence: 0.95 }),
  ];
  const result = computeMarginalValue('control', steps);
  expect(result.verdict).toBe('valuable');
  expect(result.resolutionRate).toBe(1);
  expect(result.uniqueResolutions).toBe(0);
});

test('low resolution rate yields marginal verdict', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: true, resolvedWithBaseline: true, rungConfidence: 0.3 }),
    makeStep({ stepIndex: 1, resolvedWithForce: false, rungConfidence: 0 }),
    makeStep({ stepIndex: 2, resolvedWithForce: false, rungConfidence: 0 }),
    makeStep({ stepIndex: 3, resolvedWithForce: false, rungConfidence: 0 }),
    makeStep({ stepIndex: 4, resolvedWithForce: false, rungConfidence: 0 }),
    makeStep({ stepIndex: 5, resolvedWithForce: false, rungConfidence: 0 }),
  ];
  const result = computeMarginalValue('shared-patterns', steps);
  expect(result.verdict).toBe('marginal');
  expect(result.resolutionRate).toBeCloseTo(1 / 6, 5);
});

test('zero resolutions yield redundant verdict', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: false, rungConfidence: 0 }),
    makeStep({ stepIndex: 1, resolvedWithForce: false, rungConfidence: 0 }),
  ];
  const result = computeMarginalValue('live-dom', steps);
  expect(result.verdict).toBe('redundant');
  expect(result.resolutionRate).toBe(0);
  expect(result.uniqueResolutions).toBe(0);
});

test('valuable verdict when avgConfidence > 0.8 despite low resolution rate', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: true, resolvedWithBaseline: true, rungConfidence: 0.95 }),
    makeStep({ stepIndex: 1, resolvedWithForce: false, rungConfidence: 0.9 }),
    makeStep({ stepIndex: 2, resolvedWithForce: false, rungConfidence: 0.85 }),
    makeStep({ stepIndex: 3, resolvedWithForce: false, rungConfidence: 0.8 }),
    makeStep({ stepIndex: 4, resolvedWithForce: false, rungConfidence: 0.75 }),
  ];
  const result = computeMarginalValue('prior-evidence', steps);
  expect(result.verdict).toBe('valuable');
  expect(result.avgConfidence).toBeCloseTo(0.85, 5);
});

test('degradation rate is correctly computed', () => {
  const steps: readonly RungStressStepResult[] = [
    makeStep({ stepIndex: 0, resolvedWithForce: true, degradedFromBaseline: true, rungConfidence: 0.5 }),
    makeStep({ stepIndex: 1, resolvedWithForce: true, degradedFromBaseline: false, rungConfidence: 0.5 }),
    makeStep({ stepIndex: 2, resolvedWithForce: false, degradedFromBaseline: true, rungConfidence: 0 }),
    makeStep({ stepIndex: 3, resolvedWithForce: false, degradedFromBaseline: false, rungConfidence: 0 }),
  ];
  const result = computeMarginalValue('structured-translation', steps);
  expect(result.degradationRate).toBe(0.5);
});

test('rung field is passed through correctly', () => {
  const result = computeMarginalValue('needs-human', []);
  expect(result.rung).toBe('needs-human');
});
