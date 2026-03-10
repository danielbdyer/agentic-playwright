import type { StepExecutionReceipt } from '../types';

export type ExecutionFailureFamily = StepExecutionReceipt['failure']['family'];
export type ExecutionTiming = StepExecutionReceipt['timing'];
export type ExecutionCost = StepExecutionReceipt['cost'];
export type ExecutionBudgetThresholds = StepExecutionReceipt['budget']['thresholds'];

export function emptyExecutionTiming(): ExecutionTiming {
  return {
    setupMs: 0,
    resolutionMs: 0,
    actionMs: 0,
    assertionMs: 0,
    retriesMs: 0,
    teardownMs: 0,
    totalMs: 0,
  };
}

export function normalizeFailureFamily(input: {
  status: StepExecutionReceipt['execution']['status'];
  degraded: boolean;
  diagnostics: readonly { code: string; message: string }[];
}): StepExecutionReceipt['failure'] {
  const firstDiagnostic = input.diagnostics[0];
  if (input.status === 'ok') {
    return { family: 'none', code: null, message: null };
  }
  if ((firstDiagnostic?.code ?? '') === 'needs-human' || (firstDiagnostic?.code ?? '').includes('precondition')) {
    return {
      family: 'precondition-failure',
      code: firstDiagnostic?.code ?? null,
      message: firstDiagnostic?.message ?? null,
    };
  }
  if (input.degraded) {
    return {
      family: 'locator-degradation-failure',
      code: firstDiagnostic?.code ?? null,
      message: firstDiagnostic?.message ?? null,
    };
  }
  return {
    family: 'environment-runtime-failure',
    code: firstDiagnostic?.code ?? null,
    message: firstDiagnostic?.message ?? null,
  };
}

export function evaluateExecutionBudget(input: {
  timing: ExecutionTiming;
  cost: ExecutionCost;
  thresholds?: ExecutionBudgetThresholds | null | undefined;
}): StepExecutionReceipt['budget'] {
  const thresholds = input.thresholds ?? {};
  if (Object.keys(thresholds).length === 0) {
    return {
      thresholds: {},
      status: 'not-configured',
      breaches: [],
    };
  }
  const breaches: string[] = [];
  if (thresholds.maxSetupMs !== undefined && input.timing.setupMs > thresholds.maxSetupMs) breaches.push('setupMs');
  if (thresholds.maxResolutionMs !== undefined && input.timing.resolutionMs > thresholds.maxResolutionMs) breaches.push('resolutionMs');
  if (thresholds.maxActionMs !== undefined && input.timing.actionMs > thresholds.maxActionMs) breaches.push('actionMs');
  if (thresholds.maxAssertionMs !== undefined && input.timing.assertionMs > thresholds.maxAssertionMs) breaches.push('assertionMs');
  if (thresholds.maxRetriesMs !== undefined && input.timing.retriesMs > thresholds.maxRetriesMs) breaches.push('retriesMs');
  if (thresholds.maxTeardownMs !== undefined && input.timing.teardownMs > thresholds.maxTeardownMs) breaches.push('teardownMs');
  if (thresholds.maxTotalMs !== undefined && input.timing.totalMs > thresholds.maxTotalMs) breaches.push('totalMs');
  if (thresholds.maxInstructionCount !== undefined && input.cost.instructionCount > thresholds.maxInstructionCount) breaches.push('instructionCount');
  if (thresholds.maxDiagnosticCount !== undefined && input.cost.diagnosticCount > thresholds.maxDiagnosticCount) breaches.push('diagnosticCount');
  return {
    thresholds,
    status: breaches.length > 0 ? 'over-budget' : 'within-budget',
    breaches,
  };
}
