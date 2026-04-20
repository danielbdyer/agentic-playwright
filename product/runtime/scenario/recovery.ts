/**
 * Recovery-attempt helpers — carved out of
 * `product/runtime/scenario.ts` at Step 4a (round 2) per
 * `docs/v2-direction.md §6 Step 4a` and §3.7's named split.
 *
 * Two pure functions that classify a recovery strategy's outcome
 * against the step's precondition failures, diagnostics, and
 * locator-degradation signals. Consumed by `runScenarioStep` when
 * it iterates the `RecoveryPolicy`'s strategies.
 *
 * Pure domain — no Effect, no IO.
 */

import type { RecoveryAttempt, RecoveryStrategy } from '../../domain/commitment/recovery-policy';
import type { ExecutionDiagnostic } from '../../domain/execution/types';

/** Format diagnostics for the recovery receipt, trimming to a per-
 *  strategy bound and prefixing with strategy-specific context
 *  (precondition failures for `verify-prerequisites`, degradation
 *  flag for locator-swap strategies). */
export function recoveryDiagnostics(strategy: RecoveryStrategy, input: {
  preconditionFailures: readonly string[];
  diagnostics: readonly ExecutionDiagnostic[];
  degraded: boolean;
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

/** Classify a recovery attempt's outcome as `recovered` / `skipped` /
 *  `failed`. The strategy's `id` selects the classifier. */
export function recoveryAttemptResult(strategy: RecoveryStrategy, input: {
  preconditionFailures: readonly string[];
  diagnostics: readonly ExecutionDiagnostic[];
  degraded: boolean;
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
  if (strategy.id === 'bounded-retry-with-backoff') {
    return input.diagnostics.length > 0 ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'refresh-runtime') {
    return input.diagnostics.length > 0 ? 'recovered' : 'skipped';
  }
  return 'failed';
}

/** Deterministic `setTimeout` wait used by the recovery backoff.
 *  Pulled over alongside the classifiers so the scenario body can
 *  stop re-declaring it. */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
