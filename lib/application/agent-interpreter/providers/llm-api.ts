import { Effect } from 'effect';
import {
  agentInterpreterParseError,
  agentInterpreterProviderError,
  type AgentInterpreterParseError,
  type AgentInterpreterTimeoutError,
} from '../../../domain/errors';
import type { ElementId, PostureId, ScreenId, SnapshotTemplateId } from '../../../domain/identity';
import type { ResolutionProposalDraft, ResolutionTarget, StepAction } from '../../../domain/types';
import type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterConfig,
  AgentInterpreterProvider,
  AgentLlmApiDependencies,
} from '../contract';
import { agentProviderFailureResult, withAgentRetries } from '../resilience';

function buildAgentSystemPrompt(request: AgentInterpretationRequest): string {
  const screenDescriptions = request.screens.map((screen) => {
    const elements = screen.elements.map((el) =>
      `  - element: "${el.element}" (role: ${el.role}, widget: ${el.widget}, aliases: ${el.aliases.join(', ')})`,
    ).join('\n');
    return `Screen: "${screen.screen}" (aliases: ${screen.screenAliases.join(', ')})\n${elements}`;
  }).join('\n\n');

  const exhaustionSummary = request.exhaustionTrail
    .map((entry) => `  ${entry.stage}: ${entry.outcome} — ${entry.reason}`)
    .join('\n');

  return [
    'You are an intent interpretation agent for UI test automation.',
    'A QA tester wrote a test step. The deterministic resolution pipeline could not',
    'resolve it. Your job is to interpret what the tester meant and map it to a',
    'known screen, element, action, and posture.',
    '',
    'Known screens and elements:',
    screenDescriptions,
    '',
    'Resolution attempts so far:',
    exhaustionSummary || '  (none)',
    '',
    'Respond with a JSON object:',
    '{',
    '  "interpreted": true/false,',
    '  "action": "navigate"|"input"|"click"|"select"|"assert-snapshot"|null,',
    '  "screen": "screenId"|null,',
    '  "element": "elementId"|null,',
    '  "posture": "postureId"|null,',
    '  "confidence": 0.0-1.0,',
    '  "rationale": "Brief explanation of your interpretation",',
    '  "suggestedAliases": ["alias1", "alias2"]',
    '}',
  ].join('\n');
}

function buildAgentUserMessage(request: AgentInterpretationRequest): string {
  return [
    `Step action: ${request.actionText}`,
    `Expected outcome: ${request.expectedText}`,
    `Normalized intent: ${request.normalizedIntent}`,
    request.inferredAction ? `Inferred action type: ${request.inferredAction}` : '',
    request.domSnapshot ? `\nCurrent DOM state:\n${request.domSnapshot.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n');
}

interface AgentLlmResponse {
  readonly interpreted: boolean;
  readonly action?: string | null;
  readonly screen?: string | null;
  readonly element?: string | null;
  readonly posture?: string | null;
  readonly confidence?: number;
  readonly rationale?: string;
  readonly suggestedAliases?: readonly string[];
}

function parseAgentResponse(raw: string, request: AgentInterpretationRequest, providerId: string): AgentInterpretationResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw agentInterpreterParseError(new Error('No structured JSON found in agent response.'), providerId);
  }
  const parsed = JSON.parse(jsonMatch[0]) as Partial<AgentLlmResponse>;

  if (!parsed.interpreted || !parsed.screen) {
    return {
      interpreted: false,
      target: null,
      confidence: 0,
      rationale: parsed.rationale ?? 'Agent could not interpret the step.',
      proposalDrafts: [],
      provider: providerId,
    };
  }

  const target: ResolutionTarget = {
    action: (parsed.action ?? request.inferredAction ?? 'click') as StepAction,
    screen: parsed.screen as ScreenId,
    element: (parsed.element ?? null) as ElementId | null,
    posture: (parsed.posture ?? null) as PostureId | null,
    override: null,
    snapshot_template: null as SnapshotTemplateId | null,
  };

  const proposalDrafts: ResolutionProposalDraft[] = (parsed.suggestedAliases ?? []).map((alias) => ({
    targetPath: `knowledge/screens/${parsed.screen}.hints.yaml`,
    title: `Add alias "${alias}" for ${parsed.element ?? parsed.screen}`,
    patch: {
      op: 'add',
      path: parsed.element ? `/elements/${parsed.element}/aliases/-` : '/screenAliases/-',
      value: alias,
    },
    artifactType: 'hints',
    rationale: `Agent interpretation suggested alias "${alias}" to improve future deterministic resolution.`,
  }));

  return {
    interpreted: true,
    target,
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
    rationale: parsed.rationale ?? 'Agent interpreted the step.',
    proposalDrafts,
    provider: providerId,
    observation: {
      source: 'agent-interpreted',
      summary: parsed.rationale ?? 'Agent interpreted the step.',
      detail: {
        action: target.action,
        screen: target.screen,
        element: target.element ?? '',
        confidence: String(parsed.confidence ?? 0.5),
      },
    },
  };
}

export function createLlmApiAgentProvider(config: AgentInterpreterConfig, deps: AgentLlmApiDependencies): AgentInterpreterProvider {
  const providerId = `llm-api-${config.model}`;
  return {
    id: `agent-${providerId}`,
    kind: 'llm-api',
    interpret: (request) => withAgentRetries(
      providerId,
      () => deps.createChatCompletion({
        model: config.model,
        maxTokens: config.budget.maxTokensPerStep,
        systemPrompt: buildAgentSystemPrompt(request),
        userMessage: buildAgentUserMessage(request),
      }),
    ).pipe(
      Effect.flatMap((raw) => Effect.try({
        try: () => parseAgentResponse(raw, request, providerId),
        catch: (cause) => agentInterpreterProviderError(cause, providerId),
      })),
      Effect.catchTag('AgentInterpreterTimeoutError', (error: AgentInterpreterTimeoutError) =>
        Effect.succeed(agentProviderFailureResult(providerId, `Agent LLM API timed out (${error.message}). Escalating to needs-human.`))),
      Effect.catchTag('AgentInterpreterParseError', (error: AgentInterpreterParseError) =>
        Effect.succeed(agentProviderFailureResult(providerId, `Agent LLM response parse failed (${error.message}). Escalating to needs-human.`))),
      Effect.catchAll((error) => Effect.succeed(agentProviderFailureResult(providerId, `Agent LLM API call failed (${String(error)}). Escalating to needs-human.`))),
    ),
  };
}

export function createScopedLlmApiAgentProvider(config: AgentInterpreterConfig, deps: AgentLlmApiDependencies) {
  return Effect.acquireRelease(
    Effect.succeed(createLlmApiAgentProvider(config, deps)),
    () => deps.release
      ? Effect.promise(() => deps.release!()).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void,
  );
}

export const llmApiPromptBuilders = {
  buildAgentSystemPrompt,
  buildAgentUserMessage,
  parseAgentResponse,
};
