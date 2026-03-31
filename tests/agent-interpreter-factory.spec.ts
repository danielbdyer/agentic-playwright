import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  DEFAULT_AGENT_INTERPRETER_CONFIG,
  resolveAgentInterpreterProvider,
} from '../lib/application/agent-interpreter-provider';
import type { AgentInterpretationRequest } from '../lib/domain/types/agent-interpreter';

const request: AgentInterpretationRequest = {
  taskFingerprint: 'sha256:factory',
  knowledgeFingerprint: 'sha256:knowledge',
  actionText: 'Enter policy number',
  expectedText: 'Policy number is accepted',
  normalizedIntent: 'enter policy number => policy number is accepted',
  inferredAction: null,
  screens: [{
    screen: 'policy-search',
    screenAliases: ['policy search'],
    elements: [{ element: 'policyNumberInput', name: 'Policy Number', aliases: ['policy number'], widget: 'text-input', role: 'textbox' }],
  }],
  exhaustionTrail: [],
  domSnapshot: null,
  priorTarget: null,
};

test('factory honors explicit provider override precedence', async () => {
  const provider = resolveAgentInterpreterProvider(
    { ...DEFAULT_AGENT_INTERPRETER_CONFIG, provider: 'disabled', fallback: 'disabled' },
    undefined,
    undefined,
    'heuristic',
  );

  const result = await Effect.runPromise(provider.interpret(request));
  expect(provider.kind).toBe('heuristic');
  expect(result.provider === 'heuristic' || result.provider === 'disabled').toBe(true);
  expect(result.interpreted).toBe(true);
});

test('factory falls back when primary provider declines', async () => {
  const provider = resolveAgentInterpreterProvider(
    { ...DEFAULT_AGENT_INTERPRETER_CONFIG, provider: 'session', fallback: 'heuristic' },
    undefined,
  );

  const result = await Effect.runPromise(provider.interpret(request));
  expect(result.provider).toBe('heuristic');
  expect(result.interpreted).toBe(true);
});
