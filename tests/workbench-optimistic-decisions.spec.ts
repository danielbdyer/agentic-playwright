import { expect, test } from '@playwright/test';
import {
  applyQueueDecisionOverlay,
  applyWorkbenchDecisionOverlay,
  describeDecisionPulse,
} from '../dashboard/src/hooks/use-workbench-decisions';
import type { QueuedItem, Workbench, OptimisticDecision } from '../dashboard/src/types';

const baseWorkbench: Workbench = {
  generatedAt: '2026-03-27T00:00:00.000Z',
  iteration: 12,
  items: [
    {
      id: 'item-approve',
      kind: 'approve-proposal',
      priority: 0.91,
      title: 'Approve generated proposal',
      rationale: 'ready',
      context: { screen: 'policy-search', artifactRefs: [] },
      evidence: { confidence: 0.83, sources: ['source-1'] },
    },
    {
      id: 'item-skip',
      kind: 'investigate-hotspot',
      priority: 0.42,
      title: 'Investigate hotspot',
      rationale: 'needs triage',
      context: { screen: 'policy-search', artifactRefs: [] },
      evidence: { confidence: 0.12, sources: ['source-2'] },
    },
  ],
  completions: [],
  summary: {
    total: 2,
    pending: 2,
    completed: 0,
    byKind: {
      'approve-proposal': 1,
      'investigate-hotspot': 1,
    },
    topPriority: null,
  },
};

const baseQueue: readonly QueuedItem[] = [
  {
    id: 'queue-1',
    kind: 'interpret-step',
    priority: 0.7,
    title: 'Interpret step',
    rationale: 'queued',
    displayStatus: 'processing',
    context: { screen: 'policy-search', element: 'searchButton', artifactRefs: [] },
    evidence: { confidence: 0.65, sources: ['source-3'] },
  },
  {
    id: 'queue-2',
    kind: 'author-knowledge',
    priority: 0.2,
    title: 'Author knowledge',
    rationale: 'queued',
    displayStatus: 'pending',
    context: { screen: 'policy-search', artifactRefs: [] },
    evidence: { confidence: 0.2, sources: ['source-4'] },
  },
];

const decisions: readonly OptimisticDecision[] = [
  {
    workItemId: 'item-approve',
    status: 'completed',
    rationale: 'Approved locally',
    issuedAt: 1_700_000_000_000,
  },
  {
    workItemId: 'queue-1',
    status: 'skipped',
    rationale: 'Skipped locally',
    issuedAt: 1_700_000_000_500,
  },
];

test('applyWorkbenchDecisionOverlay removes decided items and appends optimistic completions', () => {
  const projected = applyWorkbenchDecisionOverlay(baseWorkbench, decisions);

  expect(projected).not.toBeNull();
  expect(projected?.items.map((item) => item.id)).toEqual(['item-skip']);
  expect(projected?.summary.pending).toBe(1);
  expect(projected?.summary.completed).toBe(1);
  expect(projected?.summary.topPriority?.id).toBe('item-skip');
  expect(projected?.completions).toHaveLength(1);
  expect(projected?.completions[0]).toMatchObject({
    workItemId: 'item-approve',
    status: 'completed',
    rationale: 'Approved locally',
    completedAt: new Date(1_700_000_000_000).toISOString(),
  });
});

test('applyQueueDecisionOverlay marks matching items as optimistic while leaving others intact', () => {
  const projected = applyQueueDecisionOverlay(baseQueue, decisions);

  expect(projected[0]).toMatchObject({
    id: 'queue-1',
    displayStatus: 'optimistic-skipped',
    rationale: 'Skipped locally',
  });
  expect(projected[1]).toMatchObject({
    id: 'queue-2',
    displayStatus: 'pending',
  });
});

test('describeDecisionPulse summarizes the latest optimistic decision', () => {
  expect(describeDecisionPulse(null)).toBeNull();
  expect(describeDecisionPulse(decisions[1]!)).toBe('Skipped queue-1. Syncing...');
});
