/**
 * Reasoning Port Shape — Law Tests
 *
 * Verifies the 4b.B.1 port declaration:
 *   - ReasoningReceipt<Op> is generic over the three operations
 *   - buildReceipt is a pure constructor
 *   - ZERO_TOKENS is the canonical zeroed envelope
 *   - Reasoning.Tag is a proper Context.Tag for DI
 */

import { expect, test } from '@playwright/test';
import { Effect, Layer } from 'effect';
import {
  Reasoning,
  ZERO_TOKENS,
  buildReceipt,
  type ReasoningReceipt,
  type SelectPayload,
  type SynthesisPayload,
} from '../../product/reasoning/reasoning';

// ─── Law 1: ReasoningReceipt<Op> is parameterized by operation ───

test('ReasoningReceipt payload type is bound to the op discriminator', () => {
  const selectPayload: SelectPayload = {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: false,
    selected: null,
    candidates: [],
    rationale: 'test',
    failureClass: 'none',
  };
  const receipt: ReasoningReceipt<'select'> = buildReceipt({
    op: 'select',
    provider: 'test-provider',
    model: 'test-model',
    tokens: ZERO_TOKENS,
    latencyMs: 0,
    promptFingerprint: 'fp',
    payload: selectPayload,
  });
  expect(receipt.op).toBe('select');
  expect(receipt.payload.kind).toBe('translation-receipt');
});

// ─── Law 2: buildReceipt defaults tokens to ZERO_TOKENS ───

test('buildReceipt defaults omitted tokens to ZERO_TOKENS', () => {
  const synth: SynthesisPayload = { text: 'hello', stopReason: 'end-of-output' };
  const receipt = buildReceipt({
    op: 'synthesize',
    provider: 'stub',
    model: '',
    latencyMs: 5,
    promptFingerprint: '',
    payload: synth,
  });
  expect(receipt.tokens).toEqual(ZERO_TOKENS);
  expect(receipt.tokens.total).toBe(0);
});

// ─── Law 3: ZERO_TOKENS is the additive identity on total ───

test('ZERO_TOKENS has all fields at 0 and total === prompt + completion', () => {
  expect(ZERO_TOKENS.prompt).toBe(0);
  expect(ZERO_TOKENS.completion).toBe(0);
  expect(ZERO_TOKENS.total).toBe(0);
  expect(ZERO_TOKENS.total).toBe(ZERO_TOKENS.prompt + ZERO_TOKENS.completion);
});

// ─── Law 4: Reasoning.Tag resolves via Layer.succeed ───

test('Reasoning.Tag resolves the provided adapter from an Effect program', async () => {
  const stubAdapter: Reasoning = {
    select: () => Effect.succeed(buildReceipt({
      op: 'select',
      provider: 'stub',
      model: '',
      latencyMs: 0,
      promptFingerprint: '',
      payload: {
        kind: 'translation-receipt',
        version: 1,
        mode: 'structured-translation',
        matched: true,
        selected: null,
        candidates: [],
        rationale: 'stub',
        failureClass: 'none',
      },
    })),
    interpret: () => Effect.succeed(buildReceipt({
      op: 'interpret',
      provider: 'stub',
      model: '',
      latencyMs: 0,
      promptFingerprint: '',
      payload: {
        interpreted: false,
        target: null,
        confidence: 0,
        rationale: 'stub',
        proposalDrafts: [],
        provider: 'stub',
      },
    })),
    synthesize: () => Effect.succeed(buildReceipt({
      op: 'synthesize',
      provider: 'stub',
      model: '',
      latencyMs: 0,
      promptFingerprint: '',
      payload: { text: 'stub', stopReason: 'end-of-output' },
    })),
  };

  const program = Effect.gen(function* () {
    const reasoning = yield* Reasoning;
    const receipt = yield* reasoning.select({
      actionText: '',
      expectedText: '',
      normalizedIntent: '',
      allowedActions: [],
      screens: [],
      overlayRefs: [],
    } as never);
    return receipt;
  });

  const layer = Layer.succeed(Reasoning, stubAdapter);
  const receipt = await Effect.runPromise(program.pipe(Effect.provide(layer)));
  expect(receipt.op).toBe('select');
  expect(receipt.provider).toBe('stub');
});

// ─── Law 5: buildReceipt is pure (same input → same output) ───

test('buildReceipt is deterministic across repeated calls', () => {
  const payload: SynthesisPayload = { text: 'hello', stopReason: 'end-of-output' };
  const a = buildReceipt({
    op: 'synthesize',
    provider: 'stub',
    model: '',
    latencyMs: 10,
    promptFingerprint: 'fp',
    payload,
    tokens: { prompt: 5, completion: 3, total: 8 },
  });
  const b = buildReceipt({
    op: 'synthesize',
    provider: 'stub',
    model: '',
    latencyMs: 10,
    promptFingerprint: 'fp',
    payload,
    tokens: { prompt: 5, completion: 3, total: 8 },
  });
  expect(a).toEqual(b);
});
