/**
 * Reasoning Pool Adapters — Law Tests (Z11d.b, laws ZD2.*)
 *
 * Per docs/v2-live-adapter-plan.md §11:
 *   - ZD2.a — RecordReasoning.select writes pending/<fp>.json and
 *     surfaces a needs-fill failure-shaped receipt
 *   - ZD2.b — the written file deserializes to a matching PendingRequest
 *   - ZD2.c — ReplayReasoning.select on an existing filled/<fp>.json
 *     returns a receipt with provider='claude-code-session'
 *   - ZD2.d — replay receipts carry tokensSource='estimated' and
 *     latencyMeasured=false
 *   - ZD2.e — ReplayReasoning on a missing fill reports needs-fill
 *     WITHOUT writing a pending file (read-only)
 *   - ZD2.f — the composite tries replay first, falls through to
 *     record on miss
 *   - ZD2.g — concurrent recorders land exactly one pending file
 *     under one shared fingerprint
 *   - ZD2.h — filled/<fp>.json is never overwritten (append-only);
 *     a schema-mismatched fill routes to rejected/ and re-pends
 */

import { expect, test } from '@playwright/test';
import { Effect, Either } from 'effect';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  createClaudeCodeSessionReasoning,
  createRecordReasoning,
  createReplayReasoning,
} from '../../product/reasoning/adapters';
import { buildPendingRequest } from '../../product/reasoning/adapters/pool-bridge';
import {
  listPending,
  poolPaths,
  writeFilledIfAbsent,
  writePendingIfAbsent,
} from '../../product/reasoning/pool/pool-store';
import { parsePendingRequest } from '../../product/reasoning/pool/pending-request';
import type { FilledResponse } from '../../product/reasoning/pool/filled-response';
import type { TranslationRequest } from '../../product/domain/resolution/types';
import type { ScreenId, ElementId } from '../../product/domain/kernel/identity';

const run = <A>(effect: Effect.Effect<A, never, never>): Promise<A> => Effect.runPromise(effect);

async function makePoolDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'reasoning-pool-'));
}

const FIXED_NOW = () => '2026-06-09T00:00:00.000Z';

function makeSelectRequest(): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: 'tf',
    knowledgeFingerprint: 'kf',
    controlsFingerprint: null,
    normalizedIntent: 'click the submit button',
    actionText: 'Click the Submit button',
    expectedText: 'The order is submitted',
    allowedActions: ['click'],
    screens: [
      {
        screen: 'order-form' as ScreenId,
        aliases: ['order form'],
        elements: [
          {
            element: 'submit' as ElementId,
            aliases: ['submit button', 'submit order'],
            postures: [],
            snapshotTemplates: [],
          },
        ],
      },
    ],
    evidenceRefs: [],
    overlayRefs: [],
  } as TranslationRequest;
}

/** The fingerprint the adapters will compute for the sample request
 *  under default model/temperature. */
function expectedFingerprint(poolDir: string): { fp: string; pendingPath: string; filledPath: string } {
  const pending = buildPendingRequest(
    'select',
    makeSelectRequest(),
    { model: 'claude-code-session', temperature: 0 },
    FIXED_NOW(),
  );
  const paths = poolPaths(poolDir);
  return {
    fp: pending.promptFingerprint,
    pendingPath: paths.pendingPath(pending.promptFingerprint),
    filledPath: paths.filledPath(pending.promptFingerprint),
  };
}

function makeFill(fp: string, text: string): FilledResponse {
  return {
    promptFingerprint: fp,
    filledAt: '2026-06-09T00:05:00.000Z',
    authorSessionId: 'law-test-session',
    response: { text },
    reasoningSummary: 'Submit is the unambiguous button candidate.',
    estimatedTokens: { prompt: 120, response: 30, source: 'estimated' },
    supersedes: null,
  };
}

const GOOD_FILL_TEXT =
  '{ "matched": true, "screen": "order-form", "element": "submit", "score": 0.9, "rationale": "Submit button on the order form." }';

// ─── ZD2.a + ZD2.b — record writes pending + halts ───

test('ZD2.a/b RecordReasoning writes a pending envelope and surfaces a needs-fill receipt', async () => {
  const poolDir = await makePoolDir();
  const reasoning = createRecordReasoning({ poolDir, now: FIXED_NOW });

  const receipt = await run(reasoning.select(makeSelectRequest()));

  expect(receipt.provider).toBe('claude-code-session');
  expect(receipt.payload.matched).toBe(false);
  expect(receipt.payload.rationale).toContain('needs-fill');
  expect(receipt.tokensSource).toBe('unknown');
  expect(receipt.latencyMeasured).toBe(false);

  const { fp, pendingPath } = expectedFingerprint(poolDir);
  expect(receipt.promptFingerprint).toBe(fp);
  const written = JSON.parse(await fs.readFile(pendingPath, 'utf8')) as unknown;
  const parsed = parsePendingRequest(written);
  expect(Either.isRight(parsed)).toBe(true);
  if (Either.isRight(parsed)) {
    expect(parsed.right.promptFingerprint).toBe(fp);
    expect(parsed.right.op).toBe('select');
    expect(parsed.right.promptText).toContain('Click the Submit button');
    expect(parsed.right.expectedResponseShape.kind).toBe('json-schema');
  }
});

// ─── ZD2.c + ZD2.d — replay on existing fill ───

test('ZD2.c/d ReplayReasoning replays a filled response into a claude-code-session receipt', async () => {
  const poolDir = await makePoolDir();
  const { fp } = expectedFingerprint(poolDir);
  await run(writeFilledIfAbsent(poolDir, makeFill(fp, GOOD_FILL_TEXT)).pipe(Effect.orDie));

  const reasoning = createReplayReasoning({ poolDir, now: FIXED_NOW });
  const receipt = await run(reasoning.select(makeSelectRequest()));

  expect(receipt.provider).toBe('claude-code-session');
  expect(receipt.promptFingerprint).toBe(fp);
  expect(receipt.payload.matched).toBe(true);
  expect(receipt.payload.selected?.target).toBe('order-form.submit');
  expect(receipt.payload.translationProvider).toBe('claude-code-session');
  expect(receipt.tokens).toEqual({ prompt: 120, completion: 30, total: 150 });
  expect(receipt.tokensSource).toBe('estimated');
  expect(receipt.latencyMeasured).toBe(false);
});

// ─── ZD2.e — replay is read-only on miss ───

test('ZD2.e ReplayReasoning on a missing fill reports needs-fill without writing pending', async () => {
  const poolDir = await makePoolDir();
  const reasoning = createReplayReasoning({ poolDir, now: FIXED_NOW });

  const receipt = await run(reasoning.select(makeSelectRequest()));

  expect(receipt.payload.matched).toBe(false);
  expect(receipt.payload.rationale).toContain('needs-fill');
  const pending = await run(listPending(poolDir).pipe(Effect.orDie));
  expect(pending).toEqual([]);
});

// ─── ZD2.f — composite: replay first, record on miss ───

test('ZD2.f composite replays a cache hit and records on a cache miss', async () => {
  const poolDir = await makePoolDir();
  const reasoning = createClaudeCodeSessionReasoning({ poolDir, now: FIXED_NOW });
  const { fp } = expectedFingerprint(poolDir);

  // Miss: records pending + halts.
  const missReceipt = await run(reasoning.select(makeSelectRequest()));
  expect(missReceipt.payload.matched).toBe(false);
  expect(await run(listPending(poolDir).pipe(Effect.orDie))).toEqual([fp]);

  // Fill arrives; next call replays.
  await run(writeFilledIfAbsent(poolDir, makeFill(fp, GOOD_FILL_TEXT)).pipe(Effect.orDie));
  const hitReceipt = await run(reasoning.select(makeSelectRequest()));
  expect(hitReceipt.payload.matched).toBe(true);
  expect(hitReceipt.promptFingerprint).toBe(fp);
});

// ─── ZD2.g — concurrent recorders, one pending file ───

test('ZD2.g concurrent recorders race benignly to a single pending file', async () => {
  const poolDir = await makePoolDir();
  const reasoning = createRecordReasoning({ poolDir, now: FIXED_NOW });

  const receipts = await Promise.all(
    Array.from({ length: 8 }, () => run(reasoning.select(makeSelectRequest()))),
  );

  const fingerprints = new Set(receipts.map((r) => r.promptFingerprint));
  expect(fingerprints.size).toBe(1);
  const pending = await run(listPending(poolDir).pipe(Effect.orDie));
  expect(pending.length).toBe(1);
});

// ─── ZD2.h — append-only fills + rejected routing ───

test('ZD2.h writeFilledIfAbsent never overwrites; a mismatched fill routes to rejected/ and re-pends', async () => {
  const poolDir = await makePoolDir();
  const { fp } = expectedFingerprint(poolDir);

  const first = await run(writeFilledIfAbsent(poolDir, makeFill(fp, GOOD_FILL_TEXT)).pipe(Effect.orDie));
  expect(first.alreadyFilled).toBe(false);
  const second = await run(
    writeFilledIfAbsent(poolDir, makeFill(fp, '{"matched": false}')).pipe(Effect.orDie),
  );
  expect(second.alreadyFilled).toBe(true);
  const persisted = JSON.parse(await fs.readFile(first.filledPath, 'utf8')) as { response: { text: string } };
  expect(persisted.response.text).toBe(GOOD_FILL_TEXT); // original fill wins

  // Now a schema-mismatched fill on a fresh pool: no JSON object in text.
  const poolDir2 = await makePoolDir();
  const { fp: fp2 } = expectedFingerprint(poolDir2);
  await run(writeFilledIfAbsent(poolDir2, makeFill(fp2, 'not json at all')).pipe(Effect.orDie));

  const composite = createClaudeCodeSessionReasoning({ poolDir: poolDir2, now: FIXED_NOW });
  const receipt = await run(composite.select(makeSelectRequest()));
  expect(receipt.payload.matched).toBe(false);

  const paths = poolPaths(poolDir2);
  const rejectedExists = await fs.access(paths.rejectedPath(fp2)).then(() => true, () => false);
  const filledExists = await fs.access(paths.filledPath(fp2)).then(() => true, () => false);
  expect(rejectedExists).toBe(true);
  expect(filledExists).toBe(false);
  // The composite re-pended immediately, so one run suffices.
  expect(await run(listPending(poolDir2).pipe(Effect.orDie))).toEqual([fp2]);
});

// ─── Idempotent re-record keeps the original requestedAt ───

test('re-recording an already-pending fingerprint leaves the original envelope untouched', async () => {
  const poolDir = await makePoolDir();
  const pending = buildPendingRequest(
    'select',
    makeSelectRequest(),
    { model: 'claude-code-session', temperature: 0 },
    '2026-01-01T00:00:00.000Z',
  );
  await run(writePendingIfAbsent(poolDir, pending).pipe(Effect.orDie));

  const reasoning = createRecordReasoning({ poolDir, now: FIXED_NOW });
  const receipt = await run(reasoning.select(makeSelectRequest()));
  expect(receipt.payload.rationale).toContain('already recorded');

  const onDisk = JSON.parse(
    await fs.readFile(poolPaths(poolDir).pendingPath(pending.promptFingerprint), 'utf8'),
  ) as { requestedAt: string };
  expect(onDisk.requestedAt).toBe('2026-01-01T00:00:00.000Z');
});
