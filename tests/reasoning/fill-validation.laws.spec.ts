/**
 * Fill Validation + Drain Script — Law Tests (Z11d.d, laws ZD4.*)
 *
 * Per docs/v2-live-adapter-plan.md §11:
 *   - ZD4.a — empty pool → `list` reports zero, `validate` is a noop
 *   - ZD4.b — `list` surfaces pending requests with full prompt text
 *   - ZD4.c — filled response missing required fields → rejected/
 *   - ZD4.d — json-schema mismatch (per expectedResponseShape) → rejected/
 *   - ZD4.e — enum-token outside the declared set → rejected/
 *   - ZD4.f — validate is idempotent: a second run with no new
 *     fills admits/rejects nothing
 */

import { expect, test } from '@playwright/test';
import { Either } from 'effect';
import { execFileSync } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { validateFillAgainstShape } from '../../product/reasoning/pool/validate-fill';
import type { PendingRequest } from '../../product/reasoning/pool/pending-request';
import type { FilledResponse } from '../../product/reasoning/pool/filled-response';

const FP = 'a'.repeat(64);

function makePending(shape: PendingRequest['expectedResponseShape']): PendingRequest {
  return {
    promptFingerprint: FP,
    op: 'select',
    requestedAt: '2026-06-09T00:00:00.000Z',
    model: 'claude-code-session',
    temperature: 0,
    promptText: 'Select the matching element.',
    closedParams: {},
    callsite: { module: 'reasoning/select', purpose: 'rung-5 structured match' },
    expectedResponseShape: shape,
  };
}

function makeFilled(text: string, fp: string = FP): FilledResponse {
  return {
    promptFingerprint: fp,
    filledAt: '2026-06-09T00:05:00.000Z',
    authorSessionId: 's',
    response: { text },
    reasoningSummary: 'r',
    estimatedTokens: { prompt: 1, response: 1, source: 'estimated' },
    supersedes: null,
  };
}

// ─── Pure validation laws ───

test('ZD4.c a fill whose fingerprint disagrees with its pending envelope is malformed', () => {
  const verdict = validateFillAgainstShape(
    makePending({ kind: 'plain-text' }),
    makeFilled('hello', 'b'.repeat(64)),
  );
  expect(Either.isLeft(verdict)).toBe(true);
  if (Either.isLeft(verdict)) expect(verdict.left._tag).toBe('FilledMalformed');
});

test('ZD4.d json-schema fills must contain a parseable JSON object', () => {
  const pending = makePending({ kind: 'json-schema', schema: '{ "matched": boolean }' });
  expect(Either.isRight(validateFillAgainstShape(pending, makeFilled('{"matched": true}')))).toBe(true);
  expect(Either.isRight(validateFillAgainstShape(pending, makeFilled('prose then {"matched": false} trailing')))).toBe(true);
  const bad = validateFillAgainstShape(pending, makeFilled('no json here'));
  expect(Either.isLeft(bad)).toBe(true);
  if (Either.isLeft(bad)) expect(bad.left._tag).toBe('FilledSchemaMismatch');
});

test('ZD4.e enum-token fills must be exactly one declared value', () => {
  const pending = makePending({ kind: 'enum-token', enumValues: ['none', 'element:login/submit'] });
  expect(Either.isRight(validateFillAgainstShape(pending, makeFilled(' element:login/submit ')))).toBe(true);
  const bad = validateFillAgainstShape(pending, makeFilled('element:login/cancel'));
  expect(Either.isLeft(bad)).toBe(true);
  if (Either.isLeft(bad)) expect(bad.left._tag).toBe('FilledSchemaMismatch');
});

test('plain-text fills must be non-empty', () => {
  const pending = makePending({ kind: 'plain-text' });
  expect(Either.isRight(validateFillAgainstShape(pending, makeFilled('a real answer')))).toBe(true);
  expect(Either.isLeft(validateFillAgainstShape(pending, makeFilled('   ')))).toBe(true);
});

// ─── Drain script laws (subprocess against a temp pool) ───

function runScript(command: string, poolDir: string): { stdout: string; parsed: Record<string, unknown> } {
  const stdout = execFileSync(
    'npx',
    ['tsx', 'scripts/reasoning-fill.ts', command, '--pool', poolDir],
    { encoding: 'utf8', cwd: path.resolve(__dirname, '../..') },
  );
  return { stdout, parsed: JSON.parse(stdout) as Record<string, unknown> };
}

async function seedPool(poolDir: string, pending: PendingRequest, filled?: FilledResponse): Promise<void> {
  await fs.mkdir(path.join(poolDir, 'pending'), { recursive: true });
  await fs.writeFile(
    path.join(poolDir, 'pending', `${pending.promptFingerprint}.json`),
    JSON.stringify(pending, null, 2),
    'utf8',
  );
  if (filled) {
    await fs.mkdir(path.join(poolDir, 'filled'), { recursive: true });
    await fs.writeFile(
      path.join(poolDir, 'filled', `${filled.promptFingerprint}.json`),
      JSON.stringify(filled, null, 2),
      'utf8',
    );
  }
}

test('ZD4.a empty pool: list reports zero pending; validate is a noop', async () => {
  const poolDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fill-empty-'));
  const list = runScript('list', poolDir);
  expect(list.parsed.pendingCount).toBe(0);
  const validate = runScript('validate', poolDir);
  expect(validate.parsed.admitted).toBe(0);
  expect(validate.parsed.rejected).toBe(0);
  expect(validate.parsed.unfilled).toBe(0);
});

test('ZD4.b list surfaces the pending request with full prompt text and fill target', async () => {
  const poolDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fill-list-'));
  await seedPool(poolDir, makePending({ kind: 'json-schema', schema: '{}' }));
  const { parsed } = runScript('list', poolDir);
  expect(parsed.pendingCount).toBe(1);
  const requests = parsed.requests as ReadonlyArray<Record<string, unknown>>;
  expect(requests[0]!.promptFingerprint).toBe(FP);
  expect(requests[0]!.promptText).toBe('Select the matching element.');
  expect(requests[0]!.filledAlready).toBe(false);
  expect(String(parsed.fillTarget)).toContain('filled');
});

test('ZD4.d/f validate admits a good fill (consuming pending), rejects a bad one, and is idempotent', async () => {
  const poolDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fill-validate-'));
  await seedPool(
    poolDir,
    makePending({ kind: 'json-schema', schema: '{ "matched": boolean }' }),
    makeFilled('{"matched": true, "screen": null, "element": null, "score": 0, "rationale": "r"}'),
  );
  const first = runScript('validate', poolDir);
  expect(first.parsed.admitted).toBe(1);
  expect(first.parsed.rejected).toBe(0);
  const pendingLeft = await fs.readdir(path.join(poolDir, 'pending'));
  expect(pendingLeft).toEqual([]);

  // Idempotent second run: nothing pending, nothing to do.
  const second = runScript('validate', poolDir);
  expect(second.parsed.admitted).toBe(0);
  expect(second.parsed.rejected).toBe(0);

  // Bad fill on a fresh pool routes to rejected/ and keeps pending.
  const poolDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'fill-reject-'));
  await seedPool(
    poolDir2,
    makePending({ kind: 'enum-token', enumValues: ['none'] }),
    makeFilled('definitely-not-none'),
  );
  const third = runScript('validate', poolDir2);
  expect(third.parsed.rejected).toBe(1);
  expect(await fs.readdir(path.join(poolDir2, 'pending'))).toEqual([`${FP}.json`]);
  expect(await fs.readdir(path.join(poolDir2, 'rejected'))).toEqual([`${FP}.json`]);
  const filledGone = await fs.access(path.join(poolDir2, 'filled', `${FP}.json`)).then(() => true, () => false);
  expect(filledGone).toBe(false);
});
