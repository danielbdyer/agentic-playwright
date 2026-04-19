import type { StepExecutionReceipt } from '../execution/types';

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
  const budgetChecks: readonly { field: string; threshold: number | undefined; actual: number }[] = [
    { field: 'setupMs', threshold: thresholds.maxSetupMs, actual: input.timing.setupMs },
    { field: 'resolutionMs', threshold: thresholds.maxResolutionMs, actual: input.timing.resolutionMs },
    { field: 'actionMs', threshold: thresholds.maxActionMs, actual: input.timing.actionMs },
    { field: 'assertionMs', threshold: thresholds.maxAssertionMs, actual: input.timing.assertionMs },
    { field: 'retriesMs', threshold: thresholds.maxRetriesMs, actual: input.timing.retriesMs },
    { field: 'teardownMs', threshold: thresholds.maxTeardownMs, actual: input.timing.teardownMs },
    { field: 'totalMs', threshold: thresholds.maxTotalMs, actual: input.timing.totalMs },
    { field: 'instructionCount', threshold: thresholds.maxInstructionCount, actual: input.cost.instructionCount },
    { field: 'diagnosticCount', threshold: thresholds.maxDiagnosticCount, actual: input.cost.diagnosticCount },
  ];
  const breaches = budgetChecks
    .flatMap((check) => check.threshold !== undefined && check.actual > check.threshold ? [check.field] : []);
  return {
    thresholds,
    status: breaches.length > 0 ? 'over-budget' : 'within-budget',
    breaches,
  };
}
