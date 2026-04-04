import { evaluateExecutionBudget, type ExecutionBudgetThresholds, type ExecutionCost, type ExecutionTiming } from '../../commitment/telemetry';
import type { StepExecutionReceipt } from '../../execution/types';

export interface ExecutionBudgetHandoffInput {
  readonly timing: ExecutionTiming;
  readonly cost: ExecutionCost;
  readonly thresholds?: ExecutionBudgetThresholds | null | undefined;
}

export function evaluateExecutionBudgetHandoff(input: ExecutionBudgetHandoffInput): StepExecutionReceipt['budget'] {
  return evaluateExecutionBudget({
    timing: input.timing,
    cost: input.cost,
    thresholds: input.thresholds,
  });
}
