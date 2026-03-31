import { Effect } from 'effect';
import { assignVariant, type ABTestConfig } from '../agent-ab-testing';
import type {
  AgentInterpretationRequest,
  AgentInterpreterConfig,
  AgentInterpreterKind,
  AgentInterpreterProvider,
} from './contract';

function stepHashFromRequest(request: AgentInterpretationRequest): number {
  return Math.abs(request.taskFingerprint.split('').reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0));
}

export function createABTestingProvider(
  treatmentProvider: AgentInterpreterProvider,
  controlProviderFactory: (kind: AgentInterpreterKind, config: AgentInterpreterConfig) => AgentInterpreterProvider,
  abTestConfig: ABTestConfig,
  config: AgentInterpreterConfig,
): AgentInterpreterProvider {
  const controlProvider = controlProviderFactory(abTestConfig.controlProvider as AgentInterpreterKind, config);

  return {
    id: `ab-test-${abTestConfig.testId}`,
    kind: treatmentProvider.kind,
    interpret: (request) => Effect.gen(function* () {
      const variant = assignVariant(stepHashFromRequest(request), abTestConfig);
      const provider = variant === 'treatment' ? treatmentProvider : controlProvider;
      const result = yield* provider.interpret(request);
      return {
        ...result,
        provider: `${result.provider}:${variant}`,
      };
    }),
  };
}
