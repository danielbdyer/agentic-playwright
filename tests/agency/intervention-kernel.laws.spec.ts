import { test, expect } from '@playwright/test';
import { Effect } from 'effect';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeInterventionBatch } from '../../lib/application/governance/intervention-kernel';
import { createProjectPaths } from '../../lib/application/paths';
import { runWithLocalServices } from '../../lib/composition/local-services';
import type { InterventionCommandBatch } from '../../lib/domain/handshake/intervention';

function batchTemplate(batchId: string): InterventionCommandBatch {
  return {
    batchId,
    summary: 'Kernel law batch',
    continueOnFailure: true,
    actions: [
      {
        actionId: 'a-approve',
        kind: 'approve-proposal',
        summary: 'Approve proposal',
        governance: 'approved',
        target: { kind: 'proposal', ref: 'proposal-1', label: 'proposal-1' },
        prerequisites: [],
        reversible: { reversible: true, rollbackCommand: 'git checkout -- knowledge/patterns/x.yaml', rollbackRef: 'knowledge/patterns/x.yaml' },
        payload: { proposalId: 'proposal-1' },
      },
      {
        actionId: 'b-rerun',
        kind: 'rerun-scope',
        summary: 'Rerun after approval',
        governance: 'approved',
        target: { kind: 'run', ref: 'proposal-1', label: 'rerun' },
        prerequisites: [{ actionId: 'a-approve', required: true, reason: 'approval first' }],
        reversible: { reversible: false, rollbackCommand: null, rollbackRef: null },
        payload: { scope: 'ado:10001' },
      },
      {
        actionId: 'c-suppress',
        kind: 'suppress-hotspot',
        summary: 'Suppress duplicate hotspot',
        governance: 'approved',
        target: { kind: 'artifact', ref: 'hotspot:1', label: 'hotspot:1' },
        prerequisites: [{ actionId: 'a-approve', required: false, reason: 'optional dependency' }],
        reversible: { reversible: true, rollbackCommand: 'git checkout -- .tesseract/inbox/hotspots.json', rollbackRef: '.tesseract/inbox/hotspots.json' },
        payload: {},
      },
    ],
  };
}

test('intervention kernel ordering is deterministic for the same DAG', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'intervention-kernel-order-'));
  const paths = createProjectPaths(rootDir, rootDir);
  try {
    const staticNow = () => '2026-03-28T00:00:00.000Z';
    const run = () => runWithLocalServices(
      executeInterventionBatch({
        batch: batchTemplate('law-order'),
        paths,
        now: staticNow,
        kernel: {
          executeAction: ({ action }) => Effect.succeed({ summary: action.summary }),
        },
      }),
      rootDir,
    );

    const first = await run();
    const second = await run();

    expect(first.executionOrder).toEqual(second.executionOrder);
    expect(first.receipts.map((receipt) => receipt.interventionId)).toEqual(second.receipts.map((receipt) => receipt.interventionId));
    expect(first.projection.entries).toEqual(second.projection.entries);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('intervention kernel replay resumes completed actions idempotently', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'intervention-kernel-replay-'));
  const paths = createProjectPaths(rootDir, rootDir);
  try {
    const batch = batchTemplate('law-replay');
    const first = await runWithLocalServices(
      executeInterventionBatch({
        batch,
        paths,
        now: () => '2026-03-28T01:00:00.000Z',
        kernel: {
          executeAction: ({ action }) => Effect.succeed({ summary: action.summary }),
        },
      }),
      rootDir,
    );

    const replay = await runWithLocalServices(
      executeInterventionBatch({
        batch,
        paths,
        now: () => '2026-03-28T02:00:00.000Z',
        resumeFrom: new Map(first.receipts.map((receipt) => [receipt.interventionId, receipt] as const)),
        kernel: {
          executeAction: () => Effect.fail(new Error('replay should not execute completed actions') as never),
        },
      }),
      rootDir,
    );

    expect([...replay.resumedActionIds].sort()).toEqual(batch.actions.map((action) => action.actionId).sort());
    expect(replay.receipts).toEqual(first.receipts);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('intervention kernel tolerates partial failure when continueOnFailure is enabled', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'intervention-kernel-partial-failure-'));
  const paths = createProjectPaths(rootDir, rootDir);
  try {
    const result = await runWithLocalServices(
      executeInterventionBatch({
        batch: batchTemplate('law-partial-failure'),
        paths,
        now: () => '2026-03-28T03:00:00.000Z',
        kernel: {
          executeAction: ({ action }) => action.actionId === 'b-rerun'
            ? Effect.fail({ _tag: 'TesseractError', code: 'rerun-failure', message: 'rerun failed', cause: undefined } as any)
            : Effect.succeed({ summary: action.summary }),
        },
      }),
      rootDir,
    );

    expect(result.receipts.find((receipt) => receipt.interventionId === 'a-approve')?.status).toBe('completed');
    expect(result.receipts.find((receipt) => receipt.interventionId === 'b-rerun')?.status).toBe('blocked');
    expect(result.receipts.find((receipt) => receipt.interventionId === 'c-suppress')?.status).toBe('completed');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
