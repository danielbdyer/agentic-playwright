/**
 * Agent token budget enforcement.
 *
 * Pure functions for checking token usage against budget limits.
 * All functions are referentially transparent and operate on
 * immutable value objects.
 */

// ─── Value Objects ───

export interface TokenBudget {
  readonly maxTokensPerStep: number;
  readonly maxTokensPerRun: number;
}

export interface TokenUsage {
  readonly prompt: number;
  readonly completion: number;
  readonly total: number;
}

// ─── Budget Checks ───

/**
 * Returns true when the total token usage is within both per-step
 * and per-run budget limits.
 */
export function isWithinBudget(usage: TokenUsage, budget: TokenBudget): boolean {
  return usage.total <= budget.maxTokensPerStep && usage.total <= budget.maxTokensPerRun;
}

/**
 * Returns the number of tokens remaining in the per-run budget.
 * Always returns a non-negative value (clamped at zero).
 */
export function remainingBudget(used: TokenUsage, budget: TokenBudget): number {
  return Math.max(0, budget.maxTokensPerRun - used.total);
}

/**
 * Returns true when the prompt token count exceeds the per-step budget,
 * indicating the prompt should be truncated before sending.
 */
export function shouldTruncatePrompt(promptTokens: number, budget: TokenBudget): boolean {
  return promptTokens > budget.maxTokensPerStep;
}
