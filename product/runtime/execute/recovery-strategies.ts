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
import { freeSearch } from '../../domain/algebra/free-forgetful';

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
  // Delegate to the Kleisli iterator `freeSearch` from
  // product/domain/algebra/free-forgetful.ts. Each strategy is a
  // candidate; the per-candidate attempt runs its own inner loop
  // over `attempt: 1..maxAttempts`, accumulates RecoveryAttempt
  // records, and returns a "result" of true when recovery
  // succeeds (freeSearch short-circuits on non-null results).
  //
  // Global budget-cap: freeSearch doesn't thread state between
  // candidates, but the budget applies CUMULATIVELY across all
  // strategies. We handle this with a contained closure-scoped
  // array `accumulatedAttempts` that every inner loop appends to.
  // This is the legitimate "transient internal, persistent
  // external" idiom from docs/coding-notes.md § Where mutation is
  // acceptable — the mutation is scoped to one closure invocation
  // and invisible outside this function.
  //
  // When the budget cap trips mid-strategy, the inner loop
  // returns a non-null sentinel ('budget-exhausted') via the
  // result channel. The outer aggregation distinguishes success
  // from budget exhaustion by inspecting the trail's final step.

  type InnerResult =
    | { readonly kind: 'recovered' }
    | { readonly kind: 'budget-exhausted' };

  const accumulatedAttempts: RecoveryAttempt[] = [];

  const trail = freeSearch<
    ComposableRecoveryStrategy,
    { readonly ran: boolean },
    InnerResult
  >(chain, (strategy) => {
    if (!strategy.canRecover(context)) {
      return { outcome: { ran: false }, result: null };
    }
    const maxAttempts = Math.max(1, strategy.maxAttempts);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (accumulatedAttempts.length >= budget.maxAttempts) {
        return { outcome: { ran: true }, result: { kind: 'budget-exhausted' } };
      }
      const startedAt = new Date().toISOString();
      const outcome = strategy.recover(context, attempt);
      accumulatedAttempts.push({
        strategyId: strategy.id,
        family: context.family,
        attempt,
        startedAt,
        durationMs: 0,
        result: outcome.result,
        diagnostics: [...outcome.diagnostics],
      });
      if (outcome.result === 'recovered') {
        return { outcome: { ran: true }, result: { kind: 'recovered' } };
      }
    }
    return { outcome: { ran: true }, result: null };
  });

  return {
    policyProfile,
    attempts: [...accumulatedAttempts],
    recovered: trail.result?.kind === 'recovered',
  };
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
