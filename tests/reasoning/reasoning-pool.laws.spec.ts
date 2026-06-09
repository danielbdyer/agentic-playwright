/**
 * Reasoning Pool Domain — Law Tests (Z11d.a, laws ZD1.*)
 *
 * Per docs/v2-live-adapter-plan.md §11:
 *   - ZD1.a — promptFingerprint determinism
 *   - ZD1.b — closed-param key-order insensitivity
 *   - ZD1.c — model variation sensitivity
 *   - ZD1.d — foldPoolError exhaustiveness over 4 variants
 *   - ZD1.e — PendingRequest JSON round-trip
 *   - ZD1.f — FilledResponse JSON round-trip
 *   - ZD1.g — 'reasoning-pool-key' accepted by asFingerprint
 *   - ZD1.h — foldReasoningError dispatches the needs-fill family
 */

import { expect, test } from '@playwright/test';
import { Either } from 'effect';
import { promptFingerprint } from '../../product/reasoning/pool/fingerprint';
import {
  filledMalformed,
  filledSchemaMismatch,
  foldPoolError,
  needsFill,
  poolIoFailed,
  type PoolError,
} from '../../product/reasoning/pool/errors';
import { parsePendingRequest, type PendingRequest } from '../../product/reasoning/pool/pending-request';
import { estimateTokens, parseFilledResponse, type FilledResponse } from '../../product/reasoning/pool/filled-response';
import { asFingerprint } from '../../product/domain/kernel/hash';
import {
  ReasoningNeedsFillError,
  foldReasoningError,
} from '../../product/domain/kernel/errors';

// ─── ZD1.a — fingerprint determinism ───

test('ZD1.a promptFingerprint: identical inputs produce byte-equal fingerprints', () => {
  const a = promptFingerprint('select', 'Pick the login button', 'claude-fable-5', 0, { posture: 'cold-start' });
  const b = promptFingerprint('select', 'Pick the login button', 'claude-fable-5', 0, { posture: 'cold-start' });
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{64}$/); // raw hex — filename-safe, no sha256: prefix
});

// ─── ZD1.b — closed-param key-order insensitivity ───

test('ZD1.b promptFingerprint: closedParams key order does not perturb the key', () => {
  const a = promptFingerprint('interpret', 'p', 'm', 0.2, { alpha: '1', beta: '2' });
  const b = promptFingerprint('interpret', 'p', 'm', 0.2, { beta: '2', alpha: '1' });
  expect(a).toBe(b);
});

// ─── ZD1.c — model variation sensitivity ───

test('ZD1.c promptFingerprint: same prompt under a different model or op or temperature diverges', () => {
  const base = promptFingerprint('select', 'p', 'model-a', 0, {});
  expect(promptFingerprint('select', 'p', 'model-b', 0, {})).not.toBe(base);
  expect(promptFingerprint('interpret', 'p', 'model-a', 0, {})).not.toBe(base);
  expect(promptFingerprint('select', 'p', 'model-a', 0.7, {})).not.toBe(base);
});

// ─── ZD1.d — foldPoolError exhaustiveness ───

test('ZD1.d foldPoolError routes each of the four variants to the matching case', () => {
  const errors: ReadonlyArray<PoolError> = [
    needsFill('fp1', 'pending/fp1.json'),
    filledMalformed('fp2', 'bad json'),
    filledSchemaMismatch('fp3', 'enum-token'),
    poolIoFailed('pool/', 'EACCES'),
  ];
  const labels = errors.map((err) =>
    foldPoolError(err, {
      needsFill: (e) => `N:${e.promptFingerprint}`,
      filledMalformed: (e) => `M:${e.promptFingerprint}`,
      filledSchemaMismatch: (e) => `S:${e.promptFingerprint}`,
      poolIoFailed: (e) => `I:${e.path}`,
    }),
  );
  expect(labels).toEqual(['N:fp1', 'M:fp2', 'S:fp3', 'I:pool/']);
});

// ─── ZD1.e — PendingRequest round-trip ───

const samplePending: PendingRequest = {
  promptFingerprint: 'a'.repeat(64),
  op: 'select',
  requestedAt: '2026-06-09T00:00:00.000Z',
  model: 'claude-fable-5',
  temperature: 0,
  promptText: 'Select the matching element for: click the Submit button',
  closedParams: { posture: 'cold-start', candidateCount: '4' },
  callsite: { module: 'bind-step', purpose: 'rung-5 structured match' },
  expectedResponseShape: { kind: 'enum-token', enumValues: ['none', 'element:login/submit'] },
};

test('ZD1.e PendingRequest survives a JSON round-trip through parsePendingRequest', () => {
  const parsed = parsePendingRequest(JSON.parse(JSON.stringify(samplePending)));
  expect(Either.isRight(parsed)).toBe(true);
  if (Either.isRight(parsed)) {
    expect(parsed.right).toEqual(samplePending);
  }
});

test('ZD1.e PendingRequest parse rejects a missing op with a malformed verdict', () => {
  const { op: _op, ...withoutOp } = samplePending;
  const parsed = parsePendingRequest(JSON.parse(JSON.stringify(withoutOp)));
  expect(Either.isLeft(parsed)).toBe(true);
  if (Either.isLeft(parsed)) {
    expect(parsed.left._tag).toBe('FilledMalformed');
  }
});

// ─── ZD1.f — FilledResponse round-trip ───

const sampleFilled: FilledResponse = {
  promptFingerprint: 'a'.repeat(64),
  filledAt: '2026-06-09T00:05:00.000Z',
  authorSessionId: 'session-xyz',
  response: { text: 'element:login/submit' },
  reasoningSummary: 'Submit is the only button candidate.',
  estimatedTokens: { prompt: 14, response: 6, source: 'estimated' },
  supersedes: null,
};

test('ZD1.f FilledResponse survives a JSON round-trip through parseFilledResponse', () => {
  const parsed = parseFilledResponse(JSON.parse(JSON.stringify(sampleFilled)));
  expect(Either.isRight(parsed)).toBe(true);
  if (Either.isRight(parsed)) {
    expect(parsed.right).toEqual(sampleFilled);
  }
});

test('ZD1.f FilledResponse parse rejects a token estimate with an unknown source', () => {
  const corrupted = JSON.parse(JSON.stringify(sampleFilled)) as Record<string, unknown>;
  (corrupted.estimatedTokens as Record<string, unknown>).source = 'guessed';
  const parsed = parseFilledResponse(corrupted);
  expect(Either.isLeft(parsed)).toBe(true);
});

test('estimateTokens stamps source=estimated with ceil(len/4) counts', () => {
  const estimate = estimateTokens('x'.repeat(10), 'y'.repeat(4));
  expect(estimate).toEqual({ prompt: 3, response: 1, source: 'estimated' });
});

// ─── ZD1.g — fingerprint tag registered ───

test("ZD1.g 'reasoning-pool-key' is an accepted FingerprintTag", () => {
  const adopted = asFingerprint('reasoning-pool-key', 'b'.repeat(64));
  expect(typeof adopted).toBe('string');
});

// ─── ZD1.h — needs-fill family folds ───

test('ZD1.h foldReasoningError dispatches the needs-fill family with its pool coordinates', () => {
  const err = new ReasoningNeedsFillError('no fill yet', 'c'.repeat(64), 'pool/pending/c.json', 'claude-code-session');
  expect(err.family).toBe('needs-fill');
  const label = foldReasoningError(err, {
    rateLimited: () => 'R',
    contextExceeded: () => 'C',
    malformedResponse: () => 'M',
    unavailable: () => 'U',
    unclassified: () => 'X',
    needsFill: (e) => `F:${e.promptFingerprint.slice(0, 4)}:${e.pendingPath}`,
  });
  expect(label).toBe('F:cccc:pool/pending/c.json');
});
