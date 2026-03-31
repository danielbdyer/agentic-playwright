import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import { createHeuristicProvider } from '../lib/application/agent-interpreter/providers/heuristic';
import type { AgentInterpretationRequest } from '../lib/domain/types/agent-interpreter';

const request: AgentInterpretationRequest = {
  taskFingerprint: 'sha256:deterministic',
  knowledgeFingerprint: 'sha256:knowledge',
  actionText: 'Click submit payment',
  expectedText: 'Payment is processed',
  normalizedIntent: 'click submit payment => payment is processed',
  inferredAction: null,
  screens: [{
    screen: 'checkout',
    screenAliases: ['checkout', 'payment'],
    elements: [{ element: 'submitPayment', name: 'Submit Payment', aliases: ['submit payment'], widget: 'button', role: 'button' }],
  }],
  exhaustionTrail: [],
  domSnapshot: null,
  priorTarget: null,
};

test('heuristic provider is deterministic for the same request', async () => {
  const provider = createHeuristicProvider();
  const first = await Effect.runPromise(provider.interpret(request));
  const second = await Effect.runPromise(provider.interpret(request));

  expect(first).toEqual(second);
  expect(first.interpreted).toBe(true);
  expect(first.target?.screen).toBe('checkout');
  expect(first.target?.element).toBe('submitPayment');
});
