/**
 * Reasoning pool domain laws (Cycle 11 / Z11d — ZD1).
 *
 *   ZD1     fingerprint is deterministic for identical content.
 *   ZD1.b   fingerprint is insensitive to param ORDER (sorted hash).
 *   ZD1.c   fingerprint IS sensitive to model variation.
 *   ZD1.d   buildPendingRequest stamps the matching fingerprint.
 *   ZD1.e   parseFilledResponse round-trips a valid fill.
 *   ZD1.f   parseFilledResponse rejects malformed fills + bad op.
 *   ZD1.g   foldPoolError dispatches every kind exhaustively.
 */

import { describe, test, expect } from 'vitest';
import {
  reasoningPromptFingerprint,
  buildPendingRequest,
  parseFilledResponse,
  foldPoolError,
  PoolError,
  type FilledResponse,
} from '../../product/domain/reasoning-pool/pool';

describe('Cycle 11 / Z11d — reasoning pool (ZD1)', () => {
  const base = { op: 'synthesize' as const, model: 'claude-code-session', prompt: 'pick one', purpose: 'cohort' };

  test('ZD1: identical content → identical fingerprint', () => {
    expect(reasoningPromptFingerprint(base)).toBe(reasoningPromptFingerprint({ ...base }));
  });

  test('ZD1.b: param order does not change the fingerprint', () => {
    const a = reasoningPromptFingerprint({ op: 'synthesize', model: 'm', prompt: 'p', purpose: 'q' });
    const b = reasoningPromptFingerprint({ purpose: 'q', prompt: 'p', model: 'm', op: 'synthesize' });
    expect(a).toBe(b);
  });

  test('ZD1.c: model variation changes the fingerprint', () => {
    expect(reasoningPromptFingerprint(base)).not.toBe(
      reasoningPromptFingerprint({ ...base, model: 'other-model' }),
    );
  });

  test('ZD1.d: buildPendingRequest stamps the matching fingerprint', () => {
    const pending = buildPendingRequest({ ...base, context: { menu: ['English', '日本語'] }, createdAt: 'now' });
    expect(pending.fingerprint).toBe(reasoningPromptFingerprint(base));
    expect(pending.context).toEqual({ menu: ['English', '日本語'] });
  });

  test('ZD1.e: parseFilledResponse round-trips a valid fill', () => {
    const fp = reasoningPromptFingerprint(base);
    const fill: FilledResponse = {
      fingerprint: fp,
      op: 'synthesize',
      text: '日本語',
      model: 'claude-code-session',
      filledBy: 'evaluator',
      filledAt: '2026-06-13T00:00:00.000Z',
    };
    const parsed = parseFilledResponse(JSON.parse(JSON.stringify(fill)));
    expect(parsed).not.toBeInstanceOf(PoolError);
    expect((parsed as FilledResponse).text).toBe('日本語');
  });

  test('ZD1.f: parseFilledResponse rejects malformed fills + bad op', () => {
    expect(parseFilledResponse(null)).toBeInstanceOf(PoolError);
    expect(parseFilledResponse({ text: 'x' })).toBeInstanceOf(PoolError);
    expect(parseFilledResponse({ fingerprint: 'f', text: 'x', op: 'bogus' })).toBeInstanceOf(PoolError);
  });

  test('ZD1.g: foldPoolError dispatches every kind', () => {
    const kinds = (['not-filled', 'malformed-fill', 'io-failed'] as const).map((k) =>
      foldPoolError(new PoolError(k, 'm'), {
        notFilled: () => 'nf',
        malformedFill: () => 'mf',
        ioFailed: () => 'io',
      }),
    );
    expect(kinds).toEqual(['nf', 'mf', 'io']);
  });
});
