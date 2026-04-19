import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  createDeterministicProvider,
  createLlmApiProvider,
  createCopilotProvider,
  createHybridProvider,
  resolveTranslationProvider,
  parseLlmResponse,
  DEFAULT_TRANSLATION_CONFIG,
  type TranslationProvider,
  type LlmApiProviderDependencies,
  type TranslationConfig,
} from '../../product/reasoning/translation-provider';
import { translateIntentToOntology } from '../../product/reasoning/translate';
import type { TranslationRequest } from '../../product/domain/resolution/types';
import { createScreenId, createElementId } from '../../product/domain/kernel/identity';

// ─── Fixtures ───

function createTranslationRequest(overrides: Partial<TranslationRequest> = {}): TranslationRequest {
  return {
    version: 1,
    taskFingerprint: 'sha256:task',
    knowledgeFingerprint: 'sha256:knowledge',
    controlsFingerprint: null,
    normalizedIntent: 'enter policy number => policy number is accepted',
    actionText: 'Enter policy number',
    expectedText: 'Policy number is accepted',
    allowedActions: ['input', 'click'],
    screens: [
      {
        screen: createScreenId('policy-search'),
        aliases: ['policy search', 'policy lookup'],
        elements: [
          {
            element: createElementId('policyNumberInput'),
            aliases: ['policy number', 'policy ref'],
            postures: [],
            snapshotTemplates: [],
          },
        ],
      },
    ],
    evidenceRefs: [],
    overlayRefs: [],
    ...overrides,
  };
}

function createMockLlmDeps(response: string): LlmApiProviderDependencies {
  return {
    createChatCompletion: () => Promise.resolve(response),
  };
}

function createFailingLlmDeps(): LlmApiProviderDependencies {
  return {
    createChatCompletion: () => Promise.reject(new Error('API unavailable')),
  };
}

// ─── WP2 Law Tests: Translation Provider ───

test('deterministic provider produces identical receipts to translateIntentToOntology', async () => {
  const provider = createDeterministicProvider();
  const request = createTranslationRequest();
  const providerResult = await Effect.runPromise(provider.translate(request));
  const directResult = translateIntentToOntology(request);

  expect(providerResult.kind).toBe(directResult.kind);
  expect(providerResult.matched).toBe(directResult.matched);
  expect(providerResult.selected?.target).toBe(directResult.selected?.target);
  expect(providerResult.candidates).toHaveLength(directResult.candidates.length);
});

test('deterministic provider always returns valid TranslationReceipt schema', async () => {
  const provider = createDeterministicProvider();
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  expect(receipt.kind).toBe('translation-receipt');
  expect(receipt.version).toBe(1);
  expect(receipt.mode).toBe('structured-translation');
  expect(typeof receipt.matched).toBe('boolean');
  expect(typeof receipt.rationale).toBe('string');
});

test('llm-api provider sends structured prompt and parses JSON response', async () => {
  const mockResponse = JSON.stringify({
    matched: true,
    screen: 'policy-search',
    element: 'policyNumberInput',
    score: 0.92,
    rationale: 'Step mentions policy number and search field matches.',
  });
  const deps = createMockLlmDeps(mockResponse);
  const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, deps);
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  expect(receipt.matched).toBe(true);
  expect(receipt.selected?.screen).toBe('policy-search');
  expect(receipt.selected?.element).toBe('policyNumberInput');
  expect(receipt.selected?.score).toBe(0.92);
  expect(receipt.failureClass).toBe('none');
});

test('llm-api provider degrades to translator-error on API failure', async () => {
  const deps = createFailingLlmDeps();
  const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, deps);
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  expect(receipt.matched).toBe(false);
  expect(receipt.failureClass).toBe('translator-error');
  expect(receipt.selected).toBeNull();
});

test('llm-api provider degrades gracefully on unmatched LLM response', async () => {
  const deps = createMockLlmDeps('I do not know how to help with that.');
  const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, deps);
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  // No JSON object found → parseLlmResponse catch → translator-error
  expect(receipt.matched).toBe(false);
  expect(receipt.failureClass).toBe('translator-error');
});

test('llm-api provider returns no-candidate when LLM says matched:false', async () => {
  const deps = createMockLlmDeps(JSON.stringify({ matched: false, rationale: 'No match found.' }));
  const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, deps);
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  expect(receipt.matched).toBe(false);
  expect(receipt.failureClass).toBe('no-candidate');
});

test('copilot provider without deps returns runtime-disabled stub', async () => {
  const provider = createCopilotProvider();
  const receipt = await Effect.runPromise(provider.translate(createTranslationRequest()));

  expect(receipt.matched).toBe(false);
  expect(receipt.failureClass).toBe('runtime-disabled');
});

test('hybrid provider tries deterministic first and uses result when matched', async () => {
  const request = createTranslationRequest(); // has matching aliases
  const deterministic = createDeterministicProvider();
  const deterministicResult = await Effect.runPromise(deterministic.translate(request));

  // Only run hybrid test when deterministic actually matches
  if (deterministicResult.matched) {
    let llmCalled = false;
    const llm: TranslationProvider = {
      id: 'test-llm',
      kind: 'llm-api',
      translate: () => { llmCalled = true; return Effect.succeed(deterministicResult); },
    };

    const hybrid = createHybridProvider(deterministic, llm);
    const result = await Effect.runPromise(hybrid.translate(request));

    expect(result.matched).toBe(true);
    expect(llmCalled).toBe(false);
  }
});

test('hybrid provider escalates to LLM when deterministic finds no candidate', async () => {
  const request = createTranslationRequest({
    actionText: 'Completely novel action with no matching aliases whatsoever',
    expectedText: 'Something unprecedented happens',
    normalizedIntent: 'completely novel action => something unprecedented happens',
  });

  let llmCalled = false;
  const llmReceipt = {
    kind: 'translation-receipt' as const,
    version: 1 as const,
    mode: 'structured-translation' as const,
    matched: true,
    selected: {
      kind: 'screen' as const,
      target: 'policy-search',
      screen: createScreenId('policy-search'),
      aliases: ['policy search'],
      score: 0.8,
      sourceRefs: [],
    },
    candidates: [],
    rationale: 'LLM matched.',
    failureClass: 'none' as const,
  };

  const deterministic = createDeterministicProvider();
  const llm: TranslationProvider = {
    id: 'test-llm',
    kind: 'llm-api',
    translate: () => { llmCalled = true; return Effect.succeed(llmReceipt); },
  };

  const hybrid = createHybridProvider(deterministic, llm);
  const result = await Effect.runPromise(hybrid.translate(request));

  expect(llmCalled).toBe(true);
  expect(result.matched).toBe(true);
});

test('ci-batch profile always resolves to deterministic provider', () => {
  const configs: readonly TranslationConfig[] = [
    { ...DEFAULT_TRANSLATION_CONFIG, provider: 'llm-api' },
    { ...DEFAULT_TRANSLATION_CONFIG, provider: 'copilot' },
    DEFAULT_TRANSLATION_CONFIG,
  ];

  for (const config of configs) {
    const provider = resolveTranslationProvider({ config, profile: 'ci-batch' });
    expect(provider.kind).toBe('deterministic');
  }
});

test('dogfood profile uses configured provider with hybrid escalation', () => {
  const config: TranslationConfig = { ...DEFAULT_TRANSLATION_CONFIG, provider: 'llm-api' };
  const mockDeps = createMockLlmDeps('{}');
  const provider = resolveTranslationProvider({ config, profile: 'dogfood', llmDeps: mockDeps });

  // hybrid wraps both providers; the kind reflects the fallback (llm-api)
  expect(provider.id).toContain('hybrid');
  expect(provider.kind).toBe('llm-api');
});

test('interactive profile with deterministic config returns deterministic', () => {
  const provider = resolveTranslationProvider({
    config: DEFAULT_TRANSLATION_CONFIG,
    profile: 'interactive',
  });
  expect(provider.kind).toBe('deterministic');
});

test('llm-api without deps degrades to deterministic', () => {
  const config: TranslationConfig = { ...DEFAULT_TRANSLATION_CONFIG, provider: 'llm-api' };
  const provider = resolveTranslationProvider({ config, profile: 'dogfood' });

  // No llmDeps provided → createProviderByKind returns deterministic → no hybrid needed
  expect(provider.kind).toBe('deterministic');
});

test('parseLlmResponse handles valid JSON with element match', () => {
  const request = createTranslationRequest();
  const json = JSON.stringify({
    matched: true,
    screen: 'policy-search',
    element: 'policyNumberInput',
    score: 0.95,
    rationale: 'Clear match.',
  });

  const receipt = parseLlmResponse(json, request);
  expect(receipt.matched).toBe(true);
  expect(receipt.selected?.kind).toBe('element');
  expect(receipt.selected?.screen).toBe('policy-search');
  expect(receipt.selected?.element).toBe('policyNumberInput');
});

test('parseLlmResponse handles screen-only match', () => {
  const request = createTranslationRequest();
  const json = JSON.stringify({
    matched: true,
    screen: 'policy-search',
    element: null,
    score: 0.7,
    rationale: 'Screen matched, no specific element.',
  });

  const receipt = parseLlmResponse(json, request);
  expect(receipt.matched).toBe(true);
  expect(receipt.selected?.kind).toBe('screen');
  expect(receipt.selected?.screen).toBe('policy-search');
});

test('parseLlmResponse clamps score to [0, 1]', () => {
  const request = createTranslationRequest();
  const json = JSON.stringify({
    matched: true,
    screen: 'policy-search',
    element: null,
    score: 1.5,
    rationale: 'Over-confident.',
  });

  const receipt = parseLlmResponse(json, request);
  expect(receipt.selected?.score).toBeLessThanOrEqual(1);
  expect(receipt.selected?.score).toBeGreaterThanOrEqual(0);
});

test('all provider kinds produce valid TranslationReceipt schema', async () => {
  const request = createTranslationRequest();
  const providers: readonly TranslationProvider[] = [
    createDeterministicProvider(),
    createCopilotProvider(),
    createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, createMockLlmDeps('{}')),
  ];

  for (const provider of providers) {
    const receipt = await Effect.runPromise(provider.translate(request));
    expect(receipt.kind).toBe('translation-receipt');
    expect(receipt.version).toBe(1);
    expect(receipt.mode).toBe('structured-translation');
    expect(typeof receipt.matched).toBe('boolean');
    expect(typeof receipt.rationale).toBe('string');
    expect(Array.isArray(receipt.candidates)).toBe(true);
  }
});
