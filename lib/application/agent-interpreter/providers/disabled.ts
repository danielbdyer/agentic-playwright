import { Effect } from 'effect';
import type { AgentInterpreterProvider } from '../contract';

export function createDisabledProvider(): AgentInterpreterProvider {
  return {
    id: 'agent-interpreter-disabled',
    kind: 'disabled',
    interpret: () => Effect.succeed({
      interpreted: false,
      target: null,
      confidence: 0,
      rationale: 'Agent interpretation is disabled. Escalating to needs-human.',
      proposalDrafts: [],
      provider: 'disabled',
    }),
  };
}
