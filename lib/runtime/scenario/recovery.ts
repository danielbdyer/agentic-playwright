import { defaultRecoveryPolicy, recoveryFamilyConfig, type RecoveryAttempt, type RecoveryPolicy, type RecoveryStrategy } from '../../domain/execution/recovery-policy';
import type { ExecutionDiagnostic, StepExecutionReceipt } from '../../domain/types';
import type { RecoveryStageInput, RecoveryStageOutput } from './types';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recoveryDiagnostics(strategy: RecoveryStrategy, input: {
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}): string[] {
  const base = strategy.diagnostics ?? [];
  if (strategy.id === 'verify-prerequisites') {
    return [...base, ...input.preconditionFailures.map((entry) => `precondition:${entry}`)].slice(0, 5);
  }
  if (strategy.id === 'force-alternate-locator-rungs' || strategy.id === 'snapshot-guided-reresolution') {
    return [...base, input.degraded ? 'degraded-locator-observed' : 'no-degraded-locator-observed'];
  }
  return [...base, ...input.diagnostics.map((entry) => `${entry.code}:${entry.message}`).slice(0, 3)];
}

function recoveryAttemptResult(strategy: RecoveryStrategy, input: {
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}): RecoveryAttempt['result'] {
  if (strategy.id === 'verify-prerequisites') {
    return input.preconditionFailures.length === 0 ? 'recovered' : 'failed';
  }
  if (strategy.id === 'execute-prerequisite-actions') {
    return input.preconditionFailures.length > 0 ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'force-alternate-locator-rungs' || strategy.id === 'snapshot-guided-reresolution') {
    return input.degraded ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'bounded-retry-with-backoff' || strategy.id === 'refresh-runtime') {
    return input.diagnostics.length > 0 ? 'recovered' : 'skipped';
  }
  return 'failed';
}

async function executeRecoveryAttempts(input: {
  readonly family: StepExecutionReceipt['failure']['family'];
  readonly policy: RecoveryPolicy;
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}): Promise<{ readonly policyProfile: string; readonly attempts: RecoveryAttempt[]; readonly recovered: boolean }> {
  const config = recoveryFamilyConfig(input.policy, input.family);
  if (!config) {
    return { policyProfile: input.policy.profile, attempts: [], recovered: false };
  }

  const enabledStrategies = config.strategies.flatMap((entry) => entry.enabled ? [entry] : []);
  const tryStrategy = async (
    remainingStrategies: readonly typeof enabledStrategies[number][],
    priorAttempts: readonly RecoveryAttempt[],
  ): Promise<{ readonly policyProfile: string; readonly attempts: RecoveryAttempt[]; readonly recovered: boolean }> => {
    if (remainingStrategies.length === 0) {
      return { policyProfile: input.policy.profile, attempts: [...priorAttempts], recovered: false };
    }
    const [strategy, ...restStrategies] = remainingStrategies;
    const maxAttempts = Math.max(1, strategy!.maxAttempts ?? 1);
    const tryAttempt = async (
      attempt: number,
      accumulated: readonly RecoveryAttempt[],
    ): Promise<{ readonly policyProfile: string; readonly attempts: RecoveryAttempt[]; readonly recovered: boolean }> => {
      if (attempt > maxAttempts || accumulated.length >= config.budget.maxAttempts) {
        return tryStrategy(restStrategies, accumulated);
      }
      const started = Date.now();
      const result = recoveryAttemptResult(strategy!, input);
      const updated = [...accumulated, {
        strategyId: strategy!.id,
        family: input.family as Exclude<StepExecutionReceipt['failure']['family'], 'none'>,
        attempt,
        startedAt: new Date(started).toISOString(),
        durationMs: Math.max(0, Date.now() - started),
        result,
        diagnostics: recoveryDiagnostics(strategy!, input),
      }];
      if (result === 'recovered') {
        return { policyProfile: input.policy.profile, attempts: updated, recovered: true };
      }
      const backoff = strategy!.backoffMs ?? config.budget.backoffMs;
      if (backoff > 0) {
        await wait(backoff);
      }
      return tryAttempt(attempt + 1, updated);
    };
    return tryAttempt(1, priorAttempts);
  };

  return tryStrategy(enabledStrategies, []);
}

export async function runRecoveryStage(input: RecoveryStageInput): Promise<RecoveryStageOutput> {
  const policy = input.policy ?? defaultRecoveryPolicy;
  const recovery = await executeRecoveryAttempts({
    family: input.family,
    policy,
    preconditionFailures: input.preconditionFailures,
    diagnostics: input.diagnostics,
    degraded: input.degraded,
  });
  return {
    envelope: {
      stage: 'recovery',
      lane: 'execution',
      governance: recovery.recovered ? 'approved' : 'blocked',
    },
    ...recovery,
  };
}
