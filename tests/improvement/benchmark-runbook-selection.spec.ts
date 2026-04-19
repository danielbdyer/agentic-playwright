import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { collectRunbookScenarioIds } from '../../workshop/orchestration/benchmark';

test('collectRunbookScenarioIds preserves deterministic scenario id ordering across concurrency levels', async () => {
  const runbooks = [
    { runbook: 'alpha', tag: 'a' },
    { runbook: 'beta', tag: 'b' },
    { runbook: 'gamma', tag: 'c' },
  ] as const;

  const idsByRunbook: Record<string, readonly string[]> = {
    alpha: ['ADO-003', 'ADO-001'],
    beta: ['ADO-002', 'ADO-001'],
    gamma: ['ADO-004'],
  };

  const delayByRunbook: Record<string, number> = {
    alpha: 30,
    beta: 5,
    gamma: 20,
  };

  const selectRunbook = (runbook: { readonly runbook: string }) =>
    Effect.sleep(`${delayByRunbook[runbook.runbook] ?? 0} millis`).pipe(
      Effect.as(idsByRunbook[runbook.runbook] ?? []),
    );

  const sequential = await Effect.runPromise(collectRunbookScenarioIds({
    runbooks,
    concurrency: 1,
    selectRunbook,
  }));

  const concurrent = await Effect.runPromise(collectRunbookScenarioIds({
    runbooks,
    concurrency: 3,
    selectRunbook,
  }));

  expect(sequential).toEqual(['ADO-001', 'ADO-002', 'ADO-003', 'ADO-004']);
  expect(concurrent).toEqual(sequential);
});
