import type { ExecutionFailureFamily } from '../../commitment/telemetry';
import type { RecoveryPolicy } from '../../commitment/recovery-policy';
import type { ExecutionDiagnostic } from '../../types';

export interface RecoveryStrategyEnvelope {
  readonly family: ExecutionFailureFamily;
  readonly policy: RecoveryPolicy;
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}

export function buildRecoveryStrategyEnvelope(input: RecoveryStrategyEnvelope): RecoveryStrategyEnvelope {
  return {
    family: input.family,
    policy: input.policy,
    preconditionFailures: [...input.preconditionFailures],
    diagnostics: [...input.diagnostics],
    degraded: input.degraded,
  };
}
