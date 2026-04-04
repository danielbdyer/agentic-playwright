import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { createLlmApiProvider, DEFAULT_TRANSLATION_CONFIG } from '../lib/application/execution/translation-provider';
import { DEFAULT_AGENT_INTERPRETER_CONFIG, resolveAgentInterpreterProvider } from '../lib/application/agent/agent-interpreter-provider';
import type { TranslationRequest } from '../lib/domain/types';
import { createElementId, createScreenId } from '../lib/domain/kernel/identity';
import type { AgentInterpretationRequest } from '../lib/domain/types/agent-interpreter';

const request: TranslationRequest = {
  version: 1,
  taskFingerprint: 'sha256:task',
  knowledgeFingerprint: 'sha256:knowledge',
  controlsFingerprint: null,
  normalizedIntent: 'enter policy number => policy number is accepted',
  actionText: 'Enter policy number',
  expectedText: 'Policy number is accepted',
  allowedActions: ['input', 'click'],
  screens: [{
    screen: createScreenId('policy-search'),
    aliases: ['policy search'],
    elements: [{ element: createElementId('policyNumberInput'), aliases: ['policy number'], postures: [], snapshotTemplates: [] }],
  }],
  evidenceRefs: [],
  overlayRefs: [],
};

const agentRequest: AgentInterpretationRequest = {
  taskFingerprint: 'sha256:task',
  knowledgeFingerprint: 'sha256:knowledge',
  actionText: 'Enter policy number',
  expectedText: 'Policy number is accepted',
  normalizedIntent: 'enter policy number => policy number is accepted',
  inferredAction: null,
  screens: [{
    screen: createScreenId('policy-search'),
    screenAliases: ['policy search'],
    elements: [{ element: createElementId('policyNumberInput'), name: null, aliases: ['policy number'], widget: 'text-input', role: 'textbox' }],
  }],
  exhaustionTrail: [],
  domSnapshot: null,
  priorTarget: null,
};

class TimeoutErr extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

test.describe('retry resilience laws', () => {
  test('translation retries transient timeout failures and is capped', async () => {
    let calls = 0;
    const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, {
      createChatCompletion: async () => {
        calls += 1;
        throw new TimeoutErr('simulated timeout');
      },
    });

    const receipt = await Effect.runPromise(provider.translate(request));
    expect(receipt.matched).toBe(false);
    expect(receipt.failureClass).toBe('translator-error');
    expect(receipt.rationale).toContain('retry[');
    expect(calls).toBeLessThanOrEqual(4);
  });

  test('translation does not retry deterministic parse/validation failures', async () => {
    let calls = 0;
    const provider = createLlmApiProvider(DEFAULT_TRANSLATION_CONFIG, {
      createChatCompletion: async () => {
        calls += 1;
        return 'not json';
      },
    });

    const receipt = await Effect.runPromise(provider.translate(request));
    expect(receipt.failureClass).toBe('translator-error');
    expect(calls).toBe(1);
  });

  test('agent provider retries timeout and reports bounded fallback', async () => {
    let calls = 0;
    const provider = resolveAgentInterpreterProvider(
      { ...DEFAULT_AGENT_INTERPRETER_CONFIG, provider: 'llm-api', fallback: 'disabled' },
      {
        createChatCompletion: async () => {
          calls += 1;
          throw new TimeoutErr('agent timeout');
        },
      },
      undefined,
      'llm-api',
    );

    const result = await Effect.runPromise(provider.interpret(agentRequest));
    expect(result.interpreted).toBe(false);
    expect(result.rationale).toContain('Escalating to needs-human');
    expect(calls).toBeLessThanOrEqual(4);
  });
});
