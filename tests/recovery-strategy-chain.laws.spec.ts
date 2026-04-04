/**
 * Recovery Strategy Chain — Algebraic Law Tests (W2.12)
 *
 * Verifies that the composable recovery strategy chain satisfies:
 *   1. Chain tries strategies in order and stops at first match ('recovered')
 *   2. No strategy match returns original error (recovered: false)
 *   3. Strategy ordering is respected — reordering changes outcome
 *   4. Empty chain = no recovery
 *   5. Budget cap is respected across strategies
 *   6. canRecover gating is respected — skipped strategies produce no attempts
 */

import { expect, test } from '@playwright/test';
import {
  runRecoveryChain,
  selectRecoveryChain,
  defaultRecoveryChains,
  verifyPrerequisites,
  forceAlternateLocatorRungs,
  boundedRetryWithBackoff,
} from '../lib/runtime/execute/recovery-strategies';
import type { ComposableRecoveryStrategy, RecoveryContext, RecoveryAttemptOutcome } from '../lib/runtime/execute/recovery-strategies';
import type { RecoveryBudget, RecoveryFailureFamily } from '../lib/domain/execution/recovery-policy';
import { mulberry32, pick , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───

const defaultBudget: RecoveryBudget = { maxAttempts: 5, maxTotalMs: 5000, backoffMs: 0 };

function makeStrategy(
  id: string,
  canRecover: boolean,
  result: 'recovered' | 'failed' | 'skipped',
): ComposableRecoveryStrategy {
  return {
    id: id as ComposableRecoveryStrategy['id'],
    maxAttempts: 1,
    backoffMs: 0,
    canRecover: () => canRecover,
    recover: (): RecoveryAttemptOutcome => ({ result, diagnostics: [`${id}-diag`] }),
  };
}

function preconditionContext(failures: readonly string[] = ['missing-field']): RecoveryContext {
  return {
    family: 'precondition-failure',
    preconditionFailures: failures,
    diagnostics: [],
    degraded: false,
  };
}

function locatorContext(degraded: boolean = true): RecoveryContext {
  return {
    family: 'locator-degradation-failure',
    preconditionFailures: [],
    diagnostics: [],
    degraded,
  };
}

function runtimeContext(): RecoveryContext {
  return {
    family: 'environment-runtime-failure',
    preconditionFailures: [],
    diagnostics: [{ code: 'TIMEOUT', message: 'Page timed out' }],
    degraded: false,
  };
}

const allFamilies: readonly RecoveryFailureFamily[] = [
  'precondition-failure',
  'locator-degradation-failure',
  'environment-runtime-failure',
];

// ─── Law 1: Chain stops at first recovered ───

test.describe('Law 1: First-match short-circuit', () => {
  test('chain stops at first strategy that returns recovered', () => {
    const s1 = makeStrategy('s1', true, 'failed');
    const s2 = makeStrategy('s2', true, 'recovered');
    const s3 = makeStrategy('s3', true, 'recovered');

    const result = runRecoveryChain([s1, s2, s3], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]!.strategyId).toBe('s1' as never);
    expect(result.attempts[1]!.strategyId).toBe('s2' as never);
  });

  test('first strategy recovered means only one attempt', () => {
    const s1 = makeStrategy('s1', true, 'recovered');
    const s2 = makeStrategy('s2', true, 'recovered');

    const result = runRecoveryChain([s1, s2], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`first-match holds under random chain construction (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const results: Array<'recovered' | 'failed' | 'skipped'> = ['recovered', 'failed', 'skipped'];
      const chainLength = 1 + Math.floor(next() * 5);
      const chain: ComposableRecoveryStrategy[] = Array.from({ length: chainLength }, (_, i) =>
        makeStrategy(`s${i}`, true, pick(next, results)),
      );

      const outcome = runRecoveryChain(chain, preconditionContext(), defaultBudget, 'test');

      const firstRecoveredIdx = chain.findIndex((s) => {
        const r = s.recover(preconditionContext(), 1);
        return r.result === 'recovered';
      });

      if (firstRecoveredIdx >= 0) {
        expect(outcome.recovered).toBe(true);
        expect(outcome.attempts.length).toBeLessThanOrEqual(firstRecoveredIdx + 1);
      } else {
        expect(outcome.recovered).toBe(false);
      }
    });
  }
});

// ─── Law 2: No match returns original error ───

test.describe('Law 2: No match = no recovery', () => {
  test('all strategies fail means recovered is false', () => {
    const s1 = makeStrategy('s1', true, 'failed');
    const s2 = makeStrategy('s2', true, 'skipped');

    const result = runRecoveryChain([s1, s2], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(false);
    expect(result.attempts).toHaveLength(2);
  });

  test('no applicable strategies means no attempts and no recovery', () => {
    const s1 = makeStrategy('s1', false, 'recovered');
    const s2 = makeStrategy('s2', false, 'recovered');

    const result = runRecoveryChain([s1, s2], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(false);
    expect(result.attempts).toHaveLength(0);
  });
});

// ─── Law 3: Ordering is respected ───

test.describe('Law 3: Strategy ordering', () => {
  test('reordering changes which strategy produces the recovery', () => {
    const sA = makeStrategy('sA', true, 'recovered');
    const sB = makeStrategy('sB', true, 'recovered');

    const resultAB = runRecoveryChain([sA, sB], preconditionContext(), defaultBudget, 'test');
    const resultBA = runRecoveryChain([sB, sA], preconditionContext(), defaultBudget, 'test');

    expect(resultAB.attempts[0]!.strategyId).toBe('sA' as never);
    expect(resultBA.attempts[0]!.strategyId).toBe('sB' as never);
  });

  test('failed strategy at front lets later strategy recover', () => {
    const sFail = makeStrategy('sFail', true, 'failed');
    const sOk = makeStrategy('sOk', true, 'recovered');

    const result = runRecoveryChain([sFail, sOk], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(true);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1]!.strategyId).toBe('sOk' as never);
  });

  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`ordering determinism under permutation (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const chain = [
        makeStrategy('a', true, pick(next, ['recovered', 'failed', 'skipped'] as const)),
        makeStrategy('b', true, pick(next, ['recovered', 'failed', 'skipped'] as const)),
        makeStrategy('c', true, pick(next, ['recovered', 'failed', 'skipped'] as const)),
      ];

      const r1 = runRecoveryChain(chain, preconditionContext(), defaultBudget, 'test');
      const r2 = runRecoveryChain(chain, preconditionContext(), defaultBudget, 'test');

      expect(r1.recovered).toBe(r2.recovered);
      expect(r1.attempts.length).toBe(r2.attempts.length);
      r1.attempts.forEach((a, i) => {
        expect(a.strategyId).toBe(r2.attempts[i]!.strategyId);
        expect(a.result).toBe(r2.attempts[i]!.result);
      });
    });
  }
});

// ─── Law 4: Empty chain = no recovery ───

test.describe('Law 4: Empty chain', () => {
  test('empty chain returns no recovery with zero attempts', () => {
    const result = runRecoveryChain([], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(false);
    expect(result.attempts).toHaveLength(0);
    expect(result.policyProfile).toBe('test');
  });

  for (const family of allFamilies) {
    test(`empty chain for family ${family} returns no recovery`, () => {
      const ctx: RecoveryContext = {
        family,
        preconditionFailures: ['x'],
        diagnostics: [{ code: 'E', message: 'm' }],
        degraded: true,
      };
      const result = runRecoveryChain([], ctx, defaultBudget, 'profile');

      expect(result.recovered).toBe(false);
      expect(result.attempts).toHaveLength(0);
    });
  }
});

// ─── Law 5: Budget cap ───

test.describe('Law 5: Budget cap', () => {
  test('budget maxAttempts caps total attempts even when strategies want more', () => {
    const s1: ComposableRecoveryStrategy = {
      ...makeStrategy('s1', true, 'failed'),
      maxAttempts: 5,
    };
    const tightBudget: RecoveryBudget = { maxAttempts: 2, maxTotalMs: 5000, backoffMs: 0 };

    const result = runRecoveryChain([s1], preconditionContext(), tightBudget, 'test');

    expect(result.attempts).toHaveLength(2);
    expect(result.recovered).toBe(false);
  });

  test('budget of 1 stops after single attempt', () => {
    const s1 = makeStrategy('s1', true, 'failed');
    const s2 = makeStrategy('s2', true, 'recovered');
    const singleBudget: RecoveryBudget = { maxAttempts: 1, maxTotalMs: 5000, backoffMs: 0 };

    const result = runRecoveryChain([s1, s2], preconditionContext(), singleBudget, 'test');

    expect(result.attempts).toHaveLength(1);
    expect(result.recovered).toBe(false);
  });

  test('budget of 0 means zero attempts', () => {
    const s1 = makeStrategy('s1', true, 'recovered');
    const zeroBudget: RecoveryBudget = { maxAttempts: 0, maxTotalMs: 0, backoffMs: 0 };

    const result = runRecoveryChain([s1], preconditionContext(), zeroBudget, 'test');

    expect(result.attempts).toHaveLength(0);
    expect(result.recovered).toBe(false);
  });
});

// ─── Law 6: canRecover gating ───

test.describe('Law 6: canRecover gating', () => {
  test('strategies that cannot recover are skipped entirely', () => {
    const sNo = makeStrategy('sNo', false, 'recovered');
    const sYes = makeStrategy('sYes', true, 'recovered');

    const result = runRecoveryChain([sNo, sYes], preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]!.strategyId).toBe('sYes' as never);
  });

  test('all inapplicable strategies produce empty attempts', () => {
    const chain = [
      makeStrategy('a', false, 'recovered'),
      makeStrategy('b', false, 'recovered'),
      makeStrategy('c', false, 'recovered'),
    ];

    const result = runRecoveryChain(chain, preconditionContext(), defaultBudget, 'test');

    expect(result.recovered).toBe(false);
    expect(result.attempts).toHaveLength(0);
  });
});

// ─── Built-in strategy behavior ───

test.describe('Built-in strategies', () => {
  test('verifyPrerequisites recovers when no precondition failures', () => {
    const ctx = preconditionContext([]);
    expect(verifyPrerequisites.canRecover(ctx)).toBe(true);
    expect(verifyPrerequisites.recover(ctx, 1).result).toBe('recovered');
  });

  test('verifyPrerequisites fails when precondition failures exist', () => {
    const ctx = preconditionContext(['missing-field']);
    expect(verifyPrerequisites.recover(ctx, 1).result).toBe('failed');
  });

  test('forceAlternateLocatorRungs recovers only when degraded', () => {
    expect(forceAlternateLocatorRungs.recover(locatorContext(true), 1).result).toBe('recovered');
    expect(forceAlternateLocatorRungs.recover(locatorContext(false), 1).result).toBe('skipped');
  });

  test('boundedRetryWithBackoff recovers when diagnostics present', () => {
    expect(boundedRetryWithBackoff.recover(runtimeContext(), 1).result).toBe('recovered');
  });

  test('default chains cover all failure families', () => {
    for (const family of allFamilies) {
      const chain = selectRecoveryChain(family);
      expect(chain.length).toBeGreaterThan(0);
    }
  });

  test('selectRecoveryChain uses override when provided', () => {
    const custom: ComposableRecoveryStrategy[] = [makeStrategy('custom', true, 'recovered')];
    const chain = selectRecoveryChain('precondition-failure', { 'precondition-failure': custom });
    expect(chain).toBe(custom);
  });

  test('selectRecoveryChain falls back to default when no override', () => {
    const chain = selectRecoveryChain('precondition-failure', {});
    expect(chain).toBe(defaultRecoveryChains['precondition-failure']);
  });
});

// ─── policyProfile threading ───

test.describe('Policy profile threading', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`policyProfile is threaded through result (seed ${seed})`, () => {
      const next = mulberry32(seed);
      const profile = `profile-${Math.floor(next() * 1000)}`;
      const chain = [makeStrategy('s', next() > 0.5, pick(next, ['recovered', 'failed', 'skipped'] as const))];

      const result = runRecoveryChain(chain, preconditionContext(), defaultBudget, profile);

      expect(result.policyProfile).toBe(profile);
    });
  }
});
