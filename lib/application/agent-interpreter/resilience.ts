import { Duration, Effect } from 'effect';
import {
  agentInterpreterProviderError,
  type AgentInterpreterTimeoutError,
} from '../../domain/errors';
import type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterConfig,
  AgentInterpreterProvider,
} from './contract';
import {
  RETRY_POLICIES,
  formatRetryMetadata,
  retryMetadata,
  retryScheduleForTaggedErrors,
} from '../resilience/schedules';

const DEFAULT_AGENT_TIMEOUT_MS = 30_000;

export function agentProviderFailureResult(provider: string, rationale: string): AgentInterpretationResult {
  return {
    interpreted: false,
    target: null,
    confidence: 0,
    rationale,
    proposalDrafts: [],
    provider,
  };
}

export function withAgentRetries(
  providerId: string,
  run: () => Promise<string>,
): Effect.Effect<string, ReturnType<typeof agentInterpreterProviderError>> {
  const startedAt = Date.now();
  const retryPolicy = RETRY_POLICIES.agentInterpreterTimeout;
  const attemptsRef = { value: 0 };

  return Effect.tryPromise({
    try: async () => {
      attemptsRef.value += 1;
      return run();
    },
    catch: (cause) => agentInterpreterProviderError(cause, providerId),
  }).pipe(
    Effect.retryOrElse(
      retryScheduleForTaggedErrors(retryPolicy, (error) => error._tag === 'AgentInterpreterTimeoutError'),
      (error) => Effect.fail(error),
    ),
    Effect.catchTag('AgentInterpreterTimeoutError', (error: AgentInterpreterTimeoutError) =>
      Effect.fail(agentInterpreterProviderError(
        new Error(`${error.message} (${formatRetryMetadata(retryMetadata(retryPolicy, attemptsRef.value, startedAt, true))})`),
        providerId,
      ))),
  );
}

function timeoutFallbackResult(provider: string, budgetMs: number): AgentInterpretationResult {
  return {
    interpreted: false,
    target: null,
    confidence: 0,
    rationale: `Agent interpretation timed out after ${budgetMs}ms. Escalating to needs-human.`,
    proposalDrafts: [],
    provider,
    observation: {
      source: 'agent-interpreted',
      summary: `Token budget exceeded: agent call did not complete within ${budgetMs}ms.`,
      detail: {
        reason: 'token-budget-exceeded',
        timeoutMs: String(budgetMs),
      },
    },
  };
}

export function withAgentTimeout(
  interpret: (request: AgentInterpretationRequest) => Effect.Effect<AgentInterpretationResult, never, never>,
  options?: { readonly budgetMs?: number; readonly provider?: string },
): (request: AgentInterpretationRequest) => Effect.Effect<AgentInterpretationResult, never, never> {
  const budgetMs = options?.budgetMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const providerId = options?.provider ?? 'agent-timeout-wrapper';

  return (request) => withAgentTimeoutEffect(interpret(request), { budgetMs, provider: providerId });
}

export function withAgentTimeoutEffect(
  interpretEffect: Effect.Effect<AgentInterpretationResult, unknown, never>,
  options?: { readonly budgetMs?: number; readonly provider?: string },
): Effect.Effect<AgentInterpretationResult, never, never> {
  const budgetMs = options?.budgetMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const providerId = options?.provider ?? 'agent-timeout-wrapper';
  return interpretEffect.pipe(
    Effect.timeout(Duration.millis(budgetMs)),
    Effect.map((result) => result ?? timeoutFallbackResult(providerId, budgetMs)),
    Effect.catchAll(() => Effect.succeed(timeoutFallbackResult(providerId, budgetMs))),
  );
}

export function createTimeoutBoundedProvider(
  provider: AgentInterpreterProvider,
  config?: AgentInterpreterConfig,
): AgentInterpreterProvider {
  const budgetMs = config
    ? Math.min(config.budget.maxTokensPerStep * 8, DEFAULT_AGENT_TIMEOUT_MS)
    : DEFAULT_AGENT_TIMEOUT_MS;

  return {
    id: `timeout-${provider.id}`,
    kind: provider.kind,
    interpret: withAgentTimeout((request) => provider.interpret(request), { budgetMs, provider: provider.id }),
  };
}
