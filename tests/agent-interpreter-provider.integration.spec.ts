import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  DEFAULT_AGENT_INTERPRETER_CONFIG,
  resolveAgentInterpreterProvider,
  type AgentLlmApiDependencies,
} from '../lib/application/agent-interpreter-provider';
import type { AgentInterpretationRequest } from '../lib/domain/types/agent-interpreter';

const request: AgentInterpretationRequest = {
  taskFingerprint: 'sha256:integration',
  knowledgeFingerprint: 'sha256:knowledge',
  actionText: 'Click submit payment',
  expectedText: 'Payment is processed',
  normalizedIntent: 'click submit payment => payment is processed',
  inferredAction: null,
  screens: [{
    screen: 'checkout',
    screenAliases: ['checkout'],
    elements: [{ element: 'submitPayment', name: 'Submit Payment', aliases: ['submit payment'], widget: 'button', role: 'button' }],
  }],
  exhaustionTrail: [],
  domSnapshot: null,
  priorTarget: null,
};

test('end-to-end provider resolution uses llm-api and parses structured response', async () => {
  const deps: AgentLlmApiDependencies = {
    createChatCompletion: async () => JSON.stringify({
      interpreted: true,
      action: 'click',
      screen: 'checkout',
      element: 'submitPayment',
      confidence: 0.9,
      rationale: 'Matched checkout submit button',
      suggestedAliases: ['pay now'],
    }),
  };

  const provider = resolveAgentInterpreterProvider(
    { ...DEFAULT_AGENT_INTERPRETER_CONFIG, provider: 'llm-api', fallback: 'disabled' },
    deps,
  );

  const result = await Effect.runPromise(provider.interpret(request));
  expect(result.interpreted).toBe(true);
  expect(result.target?.screen).toBe('checkout');
  expect(result.proposalDrafts.length).toBe(1);
});
