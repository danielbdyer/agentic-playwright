/**
 * Reasoning Adapters — Law Tests
 *
 * Verifies the 4b.B.3 adapter layer:
 *   - deterministic adapter produces a select receipt via the shared
 *     translateIntentToOntology function
 *   - deterministic adapter's interpret/synthesize ops return the
 *     v1-equivalent "declined" shapes
 *   - composite adapter's select receipt payload equals the raw
 *     TranslationProvider payload (golden-compare, readiness §9.4 4b.3)
 *   - composite adapter's interpret receipt payload equals the raw
 *     AgentInterpreterPort payload
 *   - receipt provider/latency fields populate from the underlying
 *     providers
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  createCompositeReasoning,
  createDeterministicReasoning,
  deterministicReasoningProviderId,
} from '../../product/reasoning/adapters';
import type { TranslationProvider } from '../../product/reasoning/translation-provider';
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../../product/domain/interpretation/agent-interpreter';
import type { AgentInterpreterPort } from '../../product/domain/resolution/model';
import type { TranslationReceipt, TranslationRequest } from '../../product/domain/resolution/types';

function makeTranslationRequest(): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: 'tf',
    knowledgeFingerprint: 'kf',
    controlsFingerprint: null,
    normalizedIntent: 'enter policy number',
    actionText: 'Enter policy number',
    expectedText: 'The policy number field is filled',
    allowedActions: ['input'],
    screens: [],
    overlayRefs: [],
  } as TranslationRequest;
}

function makeInterpretRequest(): AgentInterpretationRequest {
  return {
    version: 1,
    actionText: 'click search',
    expectedText: 'results appear',
    normalizedIntent: 'click search',
    allowedActions: ['invoke'],
    screens: [],
    exhaustionTrail: [],
    posture: 'interactive',
  } as unknown as AgentInterpretationRequest;
}

// ─── Deterministic adapter ───

test('deterministic adapter select populates provider id + op discriminator', async () => {
  const reasoning = createDeterministicReasoning();
  const receipt = await Effect.runPromise(reasoning.select(makeTranslationRequest()));
  expect(receipt.op).toBe('select');
  expect(receipt.provider).toBe(deterministicReasoningProviderId);
  expect(receipt.payload.kind).toBe('translation-receipt');
});

test('deterministic adapter interpret returns declined shape with zero confidence', async () => {
  const reasoning = createDeterministicReasoning();
  const receipt = await Effect.runPromise(reasoning.interpret(makeInterpretRequest()));
  expect(receipt.payload.interpreted).toBe(false);
  expect(receipt.payload.confidence).toBe(0);
  expect(receipt.payload.target).toBeNull();
});

test('deterministic adapter synthesize returns empty-text error-stop receipt', async () => {
  const reasoning = createDeterministicReasoning();
  const receipt = await Effect.runPromise(reasoning.synthesize({ prompt: 'x', purpose: 'test' }));
  expect(receipt.payload.text).toBe('');
  expect(receipt.payload.stopReason).toBe('error');
});

// ─── Composite adapter (golden-compare with v1 providers) ───

function makeStubTranslationProvider(): TranslationProvider {
  const receipt: TranslationReceipt = {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: true,
    selected: null,
    candidates: [],
    rationale: 'stub match',
    failureClass: 'none',
  };
  return {
    id: 'stub-translation',
    kind: 'deterministic',
    select: () => Effect.succeed(receipt),
  };
}

function makeStubAgentPort(): AgentInterpreterPort<Effect.Effect<AgentInterpretationResult, never, never>> {
  const result: AgentInterpretationResult = {
    interpreted: true,
    target: null,
    confidence: 0.75,
    rationale: 'stub agent interpretation',
    proposalDrafts: [],
    provider: 'stub-agent',
  };
  return {
    id: 'stub-agent',
    kind: 'disabled',
    interpret: () => Effect.succeed(result),
  };
}

test('composite adapter select receipt payload equals the underlying TranslationProvider payload', async () => {
  const translation = makeStubTranslationProvider();
  const agent = makeStubAgentPort();
  const reasoning = createCompositeReasoning({ translation, agent });

  const receipt = await Effect.runPromise(reasoning.select(makeTranslationRequest()));
  const rawPayload = await Effect.runPromise(translation.select(makeTranslationRequest()));

  expect(receipt.payload).toEqual(rawPayload);
  expect(receipt.provider).toBe(translation.id);
  expect(receipt.op).toBe('select');
});

test('composite adapter interpret receipt payload equals the underlying AgentInterpreterPort payload', async () => {
  const translation = makeStubTranslationProvider();
  const agent = makeStubAgentPort();
  const reasoning = createCompositeReasoning({ translation, agent });

  const receipt = await Effect.runPromise(reasoning.interpret(makeInterpretRequest()));
  const rawPayload = await Effect.runPromise(agent.interpret(makeInterpretRequest()));

  expect(receipt.payload).toEqual(rawPayload);
  expect(receipt.provider).toBe(agent.id);
  expect(receipt.op).toBe('interpret');
});

test('composite adapter synthesize returns a composite-no-op receipt (no v1 backing)', async () => {
  const translation = makeStubTranslationProvider();
  const agent = makeStubAgentPort();
  const reasoning = createCompositeReasoning({ translation, agent });

  const receipt = await Effect.runPromise(reasoning.synthesize({ prompt: 'x', purpose: 'test' }));
  expect(receipt.provider).toBe('composite-no-op');
  expect(receipt.payload.text).toBe('');
});

test('composite adapter latencyMs is non-negative for every op', async () => {
  const translation = makeStubTranslationProvider();
  const agent = makeStubAgentPort();
  const reasoning = createCompositeReasoning({ translation, agent });

  const select = await Effect.runPromise(reasoning.select(makeTranslationRequest()));
  const interpret = await Effect.runPromise(reasoning.interpret(makeInterpretRequest()));
  const synthesize = await Effect.runPromise(reasoning.synthesize({ prompt: 'x', purpose: 'test' }));

  expect(select.latencyMs).toBeGreaterThanOrEqual(0);
  expect(interpret.latencyMs).toBeGreaterThanOrEqual(0);
  expect(synthesize.latencyMs).toBeGreaterThanOrEqual(0);
});
