import { Effect } from 'effect';
import {
  agentInterpreterProviderError,
  type AgentInterpreterParseError,
  type AgentInterpreterTimeoutError,
} from '../../../domain/errors';
import type { AgentInterpreterProvider, AgentLlmApiDependencies } from '../contract';
import { agentProviderFailureResult, withAgentRetries } from '../resilience';
import { llmApiPromptBuilders } from './llm-api';

export function createSessionProvider(deps?: AgentLlmApiDependencies): AgentInterpreterProvider {
  if (!deps) {
    return {
      id: 'agent-session-stub',
      kind: 'session',
      interpret: () => Effect.succeed({
        interpreted: false,
        target: null,
        confidence: 0,
        rationale: 'No interactive agent session available. Escalating to needs-human.',
        proposalDrafts: [],
        provider: 'session-stub',
      }),
    };
  }

  const providerId = 'session-agent';
  return {
    id: 'agent-session-active',
    kind: 'session',
    interpret: (request) => withAgentRetries(
      providerId,
      () => deps.createChatCompletion({
        model: 'session',
        maxTokens: 4000,
        systemPrompt: llmApiPromptBuilders.buildAgentSystemPrompt(request),
        userMessage: llmApiPromptBuilders.buildAgentUserMessage(request),
      }),
    ).pipe(
      Effect.flatMap((raw) => Effect.try({
        try: () => llmApiPromptBuilders.parseAgentResponse(raw, request, providerId),
        catch: (cause) => agentInterpreterProviderError(cause, providerId),
      })),
      Effect.catchTag('AgentInterpreterTimeoutError', (error: AgentInterpreterTimeoutError) =>
        Effect.succeed(agentProviderFailureResult(providerId, `Agent session timed out (${error.message}). Escalating to needs-human.`))),
      Effect.catchTag('AgentInterpreterParseError', (error: AgentInterpreterParseError) =>
        Effect.succeed(agentProviderFailureResult(providerId, `Agent session response parse failed (${error.message}). Escalating to needs-human.`))),
      Effect.catchAll((error) => Effect.succeed(agentProviderFailureResult(providerId, `Agent session call failed (${String(error)}). Escalating to needs-human.`))),
    ),
  };
}

export function createScopedSessionProvider(deps?: AgentLlmApiDependencies) {
  const provider = createSessionProvider(deps);
  return Effect.acquireRelease(
    Effect.succeed(provider),
    () => deps?.release
      ? Effect.promise(() => deps.release!()).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void,
  );
}
