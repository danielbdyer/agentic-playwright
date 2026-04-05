import { expect, test } from '@playwright/test';
import { evaluateExecutionBudget, normalizeFailureFamily } from '../lib/domain/commitment/telemetry';
import { defaultRecoveryPolicy, recoveryFamilyConfig } from '../lib/domain/commitment/recovery-policy';

test('normalizeFailureFamily maps failures into canonical families', () => {
  expect(normalizeFailureFamily({ status: 'ok', degraded: false, diagnostics: [] }).family).toBe('none');
  expect(normalizeFailureFamily({
    status: 'failed',
    degraded: false,
    diagnostics: [{ code: 'runtime-widget-precondition-failed', message: 'not visible' }],
  }).family).toBe('precondition-failure');
  expect(normalizeFailureFamily({
    status: 'failed',
    degraded: true,
    diagnostics: [{ code: 'runtime-execution-failed', message: 'fallback rung failed' }],
  }).family).toBe('locator-degradation-failure');
  expect(normalizeFailureFamily({
    status: 'failed',
    degraded: false,
    diagnostics: [{ code: 'runtime-execution-failed', message: 'browser disconnected' }],
  }).family).toBe('environment-runtime-failure');
});

test('evaluateExecutionBudget reports not-configured, within-budget, and over-budget states', () => {
  const timing = {
    setupMs: 1,
    resolutionMs: 5,
    actionMs: 3,
    assertionMs: 2,
    retriesMs: 0,
    teardownMs: 1,
    totalMs: 12,
  };
  const cost = { instructionCount: 2, diagnosticCount: 0 };

  const notConfigured = evaluateExecutionBudget({ timing, cost });
  expect(notConfigured.status).toBe('not-configured');

  const withinBudget = evaluateExecutionBudget({
    timing,
    cost,
    thresholds: {
      maxTotalMs: 20,
      maxInstructionCount: 4,
    },
  });
  expect(withinBudget.status).toBe('within-budget');
  expect(withinBudget.breaches).toEqual([]);

  const overBudget = evaluateExecutionBudget({
    timing,
    cost,
    thresholds: {
      maxResolutionMs: 4,
      maxTotalMs: 10,
      maxInstructionCount: 1,
    },
  });
  expect(overBudget.status).toBe('over-budget');
  expect(overBudget.breaches).toEqual(['resolutionMs', 'totalMs', 'instructionCount']);
});


test('recovery policy resolves per failure family and ignores none', () => {
  expect(recoveryFamilyConfig(defaultRecoveryPolicy, 'none')).toBeNull();
  const preconditionPolicy = recoveryFamilyConfig(defaultRecoveryPolicy, 'precondition-failure');
  expect(preconditionPolicy?.strategies.map((entry) => entry.id)).toEqual([
    'verify-prerequisites',
    'execute-prerequisite-actions',
  ]);
});

