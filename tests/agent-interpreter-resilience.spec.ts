import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { withAgentTimeoutEffect } from '../lib/application/agent-interpreter/resilience';

test('resilience timeout returns deterministic fallback semantics', async () => {
  const result = await Effect.runPromise(withAgentTimeoutEffect(Effect.never, {
    budgetMs: 5,
    provider: 'resilience-test',
  }));

  expect(result.interpreted).toBe(false);
  expect(result.provider).toBe('resilience-test');
  expect(result.observation?.detail?.reason).toBe('token-budget-exceeded');
});
