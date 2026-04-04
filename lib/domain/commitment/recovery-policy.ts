import type { StepExecutionReceipt } from '../types';

export type RecoveryFailureFamily = Exclude<StepExecutionReceipt['failure']['family'], 'none'>;

export type RecoveryStrategyId =
  | 'verify-prerequisites'
  | 'execute-prerequisite-actions'
  | 'force-alternate-locator-rungs'
  | 'snapshot-guided-reresolution'
  | 'bounded-retry-with-backoff'
  | 'refresh-runtime';

export interface RecoveryBudget {
  maxAttempts: number;
  maxTotalMs: number;
  backoffMs: number;
}

export interface RecoveryStrategy {
  id: RecoveryStrategyId;
  enabled: boolean;
  maxAttempts?: number | undefined;
  backoffMs?: number | undefined;
  diagnostics?: string[] | undefined;
}

export type RecoveryPolicyByFamily = {
  [family in RecoveryFailureFamily]: {
    budget: RecoveryBudget;
    strategies: RecoveryStrategy[];
  };
};

export interface RecoveryPolicy {
  version: 1;
  profile: string;
  families: RecoveryPolicyByFamily;
}

export interface RecoveryAttempt {
  strategyId: RecoveryStrategyId;
  family: RecoveryFailureFamily;
  attempt: number;
  startedAt: string;
  durationMs: number;
  result: 'recovered' | 'failed' | 'skipped';
  diagnostics: string[];
}

export const defaultRecoveryPolicy: RecoveryPolicy = {
  version: 1,
  profile: 'default',
  families: {
    'precondition-failure': {
      budget: {
        maxAttempts: 2,
        maxTotalMs: 750,
        backoffMs: 50,
      },
      strategies: [
        { id: 'verify-prerequisites', enabled: true, maxAttempts: 1 },
        { id: 'execute-prerequisite-actions', enabled: true, maxAttempts: 1 },
      ],
    },
    'locator-degradation-failure': {
      budget: {
        maxAttempts: 2,
        maxTotalMs: 1500,
        backoffMs: 75,
      },
      strategies: [
        { id: 'force-alternate-locator-rungs', enabled: true, maxAttempts: 1 },
        { id: 'snapshot-guided-reresolution', enabled: true, maxAttempts: 1 },
      ],
    },
    'environment-runtime-failure': {
      budget: {
        maxAttempts: 3,
        maxTotalMs: 4000,
        backoffMs: 200,
      },
      strategies: [
        { id: 'bounded-retry-with-backoff', enabled: true, maxAttempts: 2, backoffMs: 200 },
        { id: 'refresh-runtime', enabled: true, maxAttempts: 1 },
      ],
    },
  },
};

export function recoveryFamilyConfig(
  policy: RecoveryPolicy | null | undefined,
  family: StepExecutionReceipt['failure']['family'],
): RecoveryPolicyByFamily[RecoveryFailureFamily] | null {
  if (family === 'none') {
    return null;
  }
  return (policy ?? defaultRecoveryPolicy).families[family] ?? null;
}

