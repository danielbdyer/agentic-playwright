/**
 * useWorkbenchDecisions — optimistic approval/skip feedback for the dashboard.
 *
 * The hook keeps a small in-flight decision list and projects it onto the
 * workbench and queue views. useOptimistic gives us the immediate UI layer,
 * while the pending list provides durable state for clean rollback once the
 * server round-trip settles.
 */

import { useCallback, useMemo, useOptimistic, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { OptimisticDecision, QueuedItem, WorkItemDecisionInput, Workbench } from '../types';

const DECISION_QUERY_KEY = ['workbench'] as const;

const decisionMap = (decisions: readonly OptimisticDecision[]): ReadonlyMap<string, OptimisticDecision> =>
  new Map(decisions.map((decision) => [decision.workItemId, decision] as const));

const countByKind = (items: readonly { readonly kind: string }[]): Readonly<Record<string, number>> =>
  items.reduce<Record<string, number>>(
    (acc, item) => ({ ...acc, [item.kind]: (acc[item.kind] ?? 0) + 1 }),
    {},
  );

export const describeDecisionPulse = (decision: OptimisticDecision | null): string | null =>
  decision
    ? `${decision.status === 'completed' ? 'Approved' : 'Skipped'} ${decision.workItemId.slice(0, 8)}. Syncing...`
    : null;

export const applyWorkbenchDecisionOverlay = (
  workbench: Workbench | null,
  decisions: readonly OptimisticDecision[],
): Workbench | null => {
  if (!workbench) return null;
  const workbenchItemIds = new Set(workbench.items.map((item) => item.id));
  const activeDecisions = decisions.filter((decision) => workbenchItemIds.has(decision.workItemId));
  const activeDecisionIds = new Set(activeDecisions.map((decision) => decision.workItemId));
  const pendingItems = workbench.items.filter((item) => !activeDecisionIds.has(item.id));
  const optimisticCompletions = activeDecisions.map((decision) => ({
    workItemId: decision.workItemId,
    status: decision.status,
    completedAt: new Date(decision.issuedAt).toISOString(),
    rationale: decision.rationale,
  }));

  return {
    ...workbench,
    items: pendingItems,
    completions: [...workbench.completions, ...optimisticCompletions],
    summary: {
      ...workbench.summary,
      pending: pendingItems.length,
      completed: workbench.summary.completed + activeDecisions.length,
      byKind: countByKind(pendingItems),
      topPriority: pendingItems[0] ?? null,
    },
  };
};

export const applyQueueDecisionOverlay = (
  queue: readonly QueuedItem[],
  decisions: readonly OptimisticDecision[],
): readonly QueuedItem[] => {
  const decisionsById = decisionMap(decisions);
  return queue.map((item) => {
    const decision = decisionsById.get(item.id);
    return decision
      ? {
          ...item,
          displayStatus: decision.status === 'completed'
            ? 'optimistic-completed'
            : 'optimistic-skipped',
          rationale: decision.rationale,
        }
      : item;
  });
};

export interface WorkbenchDecisionFlow {
  readonly workbench: Workbench | null;
  readonly queue: readonly QueuedItem[];
  readonly optimisticDecisions: readonly OptimisticDecision[];
  readonly pendingDecisionCount: number;
  readonly decisionPulse: string | null;
  readonly approve: (workItemId: string) => void;
  readonly skip: (workItemId: string) => void;
}

export function useWorkbenchDecisions(input: {
  readonly workbench: Workbench | null;
  readonly queue: readonly QueuedItem[];
  readonly send: (msg: unknown) => void;
}): WorkbenchDecisionFlow {
  const queryClient = useQueryClient();
  const [pendingDecisions, setPendingDecisions] = useState<readonly OptimisticDecision[]>([]);
  const [optimisticDecisions, addOptimisticDecision] = useOptimistic(
    pendingDecisions,
    (current, decision: OptimisticDecision) => [
      ...current.filter((existing) => existing.workItemId !== decision.workItemId),
      decision,
    ],
  );

  const mutation = useMutation({
    mutationFn: async (decision: WorkItemDecisionInput) => {
      input.send({ type: 'decision', ...decision });
      await fetch('/api/workbench/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completion: {
            ...decision,
            completedAt: new Date().toISOString(),
            artifactsWritten: [],
          },
        }),
      });
    },
  });

  const submitDecision = useCallback((workItemId: string, status: WorkItemDecisionInput['status'], rationale: string) => {
    const decision: OptimisticDecision = {
      workItemId,
      status,
      rationale,
      issuedAt: Date.now(),
    };
    addOptimisticDecision(decision);
    setPendingDecisions((current) => [
      ...current.filter((existing) => existing.workItemId !== workItemId),
      decision,
    ]);

    mutation.mutate(decision, {
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: DECISION_QUERY_KEY });
        setPendingDecisions((current) => current.filter((existing) => existing.workItemId !== workItemId));
      },
    });
  }, [addOptimisticDecision, mutation, queryClient]);

  const approve = useCallback(
    (workItemId: string) => submitDecision(workItemId, 'completed', 'Dashboard approved'),
    [submitDecision],
  );
  const skip = useCallback(
    (workItemId: string) => submitDecision(workItemId, 'skipped', 'Dashboard skipped'),
    [submitDecision],
  );

  const workbench = useMemo(
    () => applyWorkbenchDecisionOverlay(input.workbench, optimisticDecisions),
    [input.workbench, optimisticDecisions],
  );
  const queue = useMemo(
    () => applyQueueDecisionOverlay(input.queue, optimisticDecisions),
    [input.queue, optimisticDecisions],
  );
  const decisionPulse = useMemo(
    () => describeDecisionPulse(optimisticDecisions[optimisticDecisions.length - 1] ?? null),
    [optimisticDecisions],
  );

  return {
    workbench,
    queue,
    optimisticDecisions,
    pendingDecisionCount: optimisticDecisions.length,
    decisionPulse,
    approve,
    skip,
  } as const;
}
