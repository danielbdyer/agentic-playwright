import { Effect } from 'effect';
import type { ABTestConfig } from '../agent-ab-testing';
import type {
  AgentInterpreterConfig,
  AgentInterpreterKind,
  AgentInterpreterProvider,
  AgentLlmApiDependencies,
} from './contract';
import { DEFAULT_AGENT_INTERPRETER_CONFIG } from './contract';
import { createABTestingProvider } from './ab-testing';
import { createDisabledProvider } from './providers/disabled';
import { createHeuristicProvider } from './providers/heuristic';
import { createLlmApiAgentProvider } from './providers/llm-api';
import { createSessionProvider } from './providers/session';
import { createTimeoutBoundedProvider } from './resilience';

function createCompositeAgentProvider(primary: AgentInterpreterProvider, fallback: AgentInterpreterProvider): AgentInterpreterProvider {
  return {
    id: `composite-${primary.id}-${fallback.id}`,
    kind: primary.kind,
    interpret: (request) => Effect.gen(function* () {
      const primaryResult = yield* primary.interpret(request);
      return primaryResult.interpreted ? primaryResult : yield* fallback.interpret(request);
    }),
  };
}

function createAgentProviderByKind(
  kind: AgentInterpreterKind,
  config: AgentInterpreterConfig,
  deps?: AgentLlmApiDependencies,
): AgentInterpreterProvider {
  switch (kind) {
    case 'disabled':
      return createDisabledProvider();
    case 'heuristic':
      return createHeuristicProvider();
    case 'llm-api':
      return deps ? createLlmApiAgentProvider(config, deps) : createDisabledProvider();
    case 'session':
      return createSessionProvider(deps);
  }
}

export function resolveAgentInterpreterProvider(
  config?: AgentInterpreterConfig,
  deps?: AgentLlmApiDependencies,
  abTestConfig?: ABTestConfig,
  providerOverride?: AgentInterpreterKind,
): AgentInterpreterProvider {
  const effectiveConfig = config ?? DEFAULT_AGENT_INTERPRETER_CONFIG;
  const providerKind = providerOverride ?? effectiveConfig.provider;
  const fallbackKind = effectiveConfig.fallback;

  const rawPrimary = createAgentProviderByKind(providerKind, effectiveConfig, deps);
  const rawFallback = providerKind !== fallbackKind
    ? createAgentProviderByKind(fallbackKind, effectiveConfig, deps)
    : null;

  const primary = rawPrimary.kind !== 'disabled' ? createTimeoutBoundedProvider(rawPrimary, effectiveConfig) : rawPrimary;
  const fallback = rawFallback && rawFallback.kind !== 'disabled'
    ? createTimeoutBoundedProvider(rawFallback, effectiveConfig)
    : rawFallback;

  const resolved = fallback ? createCompositeAgentProvider(primary, fallback) : primary;

  return abTestConfig
    ? createABTestingProvider(resolved, (kind, cfg) => createAgentProviderByKind(kind, cfg, deps), abTestConfig, effectiveConfig)
    : resolved;
}
