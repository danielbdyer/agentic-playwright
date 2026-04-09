/**
 * Recovery Strategy Chain (W2.12)
 *
 * Composable recovery strategies extracted from scenario.ts executeRecoveryAttempts.
 * Each strategy declares whether it can handle a given failure context, and if so,
 * how to recover. The chain runner walks strategies in order, stopping at the first
 * match — identical to the resolution precedence ladder pattern.
 *
 * Strategies are pure data + functions. The chain is configurable per-runbook by
 * supplying a different ordering or subset of strategies.
 */

import type { RecoveryAttempt, RecoveryBudget, RecoveryFailureFamily, RecoveryStrategyId } from '../../domain/commitment/recovery-policy';
import type { ExecutionDiagnostic } from '../../domain/execution/types';

// ─── Recovery context passed to each strategy ───

export interface RecoveryContext {
  readonly family: RecoveryFailureFamily;
  readonly preconditionFailures: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly degraded: boolean;
}

// ─── Composable recovery strategy interface ───

export interface ComposableRecoveryStrategy {
  readonly id: RecoveryStrategyId;
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly canRecover: (context: RecoveryContext) => boolean;
  readonly recover: (context: RecoveryContext, attempt: number) => RecoveryAttemptOutcome;
}

export interface RecoveryAttemptOutcome {
  readonly result: RecoveryAttempt['result'];
  readonly diagnostics: readonly string[];
}

// ─── Chain result ───

export interface RecoveryChainResult {
  readonly policyProfile: string;
  readonly attempts: readonly RecoveryAttempt[];
  readonly recovered: boolean;
}

// ─── Individual strategies ───

export const verifyPrerequisites: ComposableRecoveryStrategy = {
  id: 'verify-prerequisites',
  maxAttempts: 1,
  backoffMs: 0,
  canRecover: (ctx) => ctx.family === 'precondition-failure',
  recover: (ctx) => ({
    result: ctx.preconditionFailures.length === 0 ? 'recovered' : 'failed',
    diagnostics: ctx.preconditionFailures.map((entry) => `precondition:${entry}`).slice(0, 5),
  }),
};

export const executePrerequisiteActions: ComposableRecoveryStrategy = {
  id: 'execute-prerequisite-actions',
  maxAttempts: 1,
  backoffMs: 0,
  canRecover: (ctx) => ctx.family === 'precondition-failure',
  recover: (ctx) => ({
    result: ctx.preconditionFailures.length > 0 ? 'recovered' : 'skipped',
    diagnostics: ctx.preconditionFailures.map((entry) => `precondition:${entry}`).slice(0, 5),
  }),
};

export const forceAlternateLocatorRungs: ComposableRecoveryStrategy = {
  id: 'force-alternate-locator-rungs',
  maxAttempts: 1,
  backoffMs: 0,
  canRecover: (ctx) => ctx.family === 'locator-degradation-failure',
  recover: (ctx) => ({
    result: ctx.degraded ? 'recovered' : 'skipped',
    diagnostics: [ctx.degraded ? 'degraded-locator-observed' : 'no-degraded-locator-observed'],
  }),
};

export const snapshotGuidedReresolution: ComposableRecoveryStrategy = {
  id: 'snapshot-guided-reresolution',
  maxAttempts: 1,
  backoffMs: 0,
  canRecover: (ctx) => ctx.family === 'locator-degradation-failure',
  recover: (ctx) => ({
    result: ctx.degraded ? 'recovered' : 'skipped',
    diagnostics: [ctx.degraded ? 'degraded-locator-observed' : 'no-degraded-locator-observed'],
  }),
};

export const boundedRetryWithBackoff: ComposableRecoveryStrategy = {
  id: 'bounded-retry-with-backoff',
  maxAttempts: 2,
  backoffMs: 200,
  canRecover: (ctx) => ctx.family === 'environment-runtime-failure',
  recover: (ctx) => ({
    result: ctx.diagnostics.length > 0 ? 'recovered' : 'skipped',
    diagnostics: ctx.diagnostics.map((entry) => `${entry.code}:${entry.message}`).slice(0, 3),
  }),
};

export const refreshRuntime: ComposableRecoveryStrategy = {
  id: 'refresh-runtime',
  maxAttempts: 1,
  backoffMs: 0,
  canRecover: (ctx) => ctx.family === 'environment-runtime-failure',
  recover: (ctx) => ({
    result: ctx.diagnostics.length > 0 ? 'recovered' : 'skipped',
    diagnostics: ctx.diagnostics.map((entry) => `${entry.code}:${entry.message}`).slice(0, 3),
  }),
};

// ─── Default chain by failure family ───

export const defaultRecoveryChains: Readonly<Record<RecoveryFailureFamily, readonly ComposableRecoveryStrategy[]>> = {
  'precondition-failure': [verifyPrerequisites, executePrerequisiteActions],
  'locator-degradation-failure': [forceAlternateLocatorRungs, snapshotGuidedReresolution],
  'environment-runtime-failure': [boundedRetryWithBackoff, refreshRuntime],
};

// ─── Chain runner ───

/**
 * Run a recovery strategy chain in order, stopping at the first strategy
 * that produces a 'recovered' result. Respects per-strategy maxAttempts
 * and a global budget. Pure function over the chain — no side effects.
 *
 * Invariants:
 * - Strategies are tried in array order (ordering is respected).
 * - The chain stops at the first 'recovered' result.
 * - An empty chain returns no recovery (original error propagates).
 * - Budget.maxAttempts caps total attempts across all strategies.
 */
export function runRecoveryChain(
  chain: readonly ComposableRecoveryStrategy[],
  context: RecoveryContext,
  budget: RecoveryBudget,
  policyProfile: string,
): RecoveryChainResult {
  const tryStrategy = (
    remainingStrategies: readonly ComposableRecoveryStrategy[],
    priorAttempts: readonly RecoveryAttempt[],
  ): RecoveryChainResult => {
    if (remainingStrategies.length === 0) {
      return { policyProfile, attempts: [...priorAttempts], recovered: false };
    }
    const [head, ...restStrategies] = remainingStrategies;
    const strategy = head!;
    if (!strategy.canRecover(context)) {
      return tryStrategy(restStrategies, priorAttempts);
    }
    const maxAttempts = Math.max(1, strategy.maxAttempts);
    const tryAttempt = (
      attempt: number,
      accumulated: readonly RecoveryAttempt[],
    ): RecoveryChainResult => {
      if (attempt > maxAttempts || accumulated.length >= budget.maxAttempts) {
        return accumulated.length >= budget.maxAttempts
          ? { policyProfile, attempts: [...accumulated], recovered: false }
          : tryStrategy(restStrategies, accumulated);
      }
      const startedAt = new Date().toISOString();
      const outcome = strategy.recover(context, attempt);
      const updated = [...accumulated, {
        strategyId: strategy.id,
        family: context.family,
        attempt,
        startedAt,
        durationMs: 0,
        result: outcome.result,
        diagnostics: [...outcome.diagnostics],
      }];
      if (outcome.result === 'recovered') {
        return { policyProfile, attempts: updated, recovered: true };
      }
      return tryAttempt(attempt + 1, updated);
    };
    return tryAttempt(1, priorAttempts);
  };
  return tryStrategy([...chain], []);
}

/**
 * Select the appropriate chain for a failure family, with optional
 * per-runbook override. Falls back to the default chain.
 */
export function selectRecoveryChain(
  family: RecoveryFailureFamily,
  overrides?: Readonly<Partial<Record<RecoveryFailureFamily, readonly ComposableRecoveryStrategy[]>>>,
): readonly ComposableRecoveryStrategy[] {
  // Overrides is Partial, so may be undefined per family.
  // defaultRecoveryChains is a full Record<RecoveryFailureFamily, ...>
  // so its lookup is non-nullable — no trailing `?? []` fallback
  // needed. Previously there was a dead `?? []` that masked the
  // (correct) compile-time guarantee.
  return overrides?.[family] ?? defaultRecoveryChains[family];
}
