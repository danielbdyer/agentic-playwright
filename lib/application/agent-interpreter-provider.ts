/**
 * AgentInterpreterProvider — Strategy pattern for pluggable agent interpretation backends.
 *
 * Three provider implementations share a single contract:
 *   1. disabled — stub that always declines (free, always available)
 *   2. llm-api — OpenAI-compatible API (Azure AI Foundry; token cost, requires config)
 *   3. session — interactive agent session (Claude Code CLI, VSCode Copilot Chat, MCP)
 *
 * The agent interpreter sits at rung 9 of the resolution ladder, after live-dom
 * and before needs-human. It receives the full context of what prior rungs attempted
 * and failed, plus the DOM state, and makes a semantic judgment about what the
 * QA tester's step text means.
 *
 * The key property: the agent interprets once (expensive, ~2-5s), produces a
 * typed resolution target + proposal drafts. The proposals get compiled into
 * deterministic knowledge, so future runs with similar intent resolve at
 * rungs 1-6 (free, <1ms). The agent's cost amortizes to zero.
 *
 * Provider selection follows the same precedence as TranslationProvider:
 *   - `session` when an interactive agent is present (Claude Code, Copilot)
 *   - `llm-api` as a configurable fallback (Azure AI Foundry)
 *   - `disabled` when no agent capability is available (ci-batch profile)
 */

import { Effect, Duration } from 'effect';
import type { ResolutionTarget, ResolutionProposalDraft } from '../domain/types';
import type { StepAction } from '../domain/types';
import type { ScreenId, ElementId, PostureId, SnapshotTemplateId } from '../domain/identity';
import { normalizeIntentText, bestAliasMatch, humanizeIdentifier } from '../domain/inference';
import { assignVariant, type ABTestConfig } from './agent-ab-testing';

// Re-export type interfaces from domain layer for backwards compatibility
export type {
  AgentInterpretationRequest,
  AgentInterpretationResult,
  AgentInterpreterKind,
  AgentInterpreterProvider,
} from '../domain/types/agent-interpreter';

import type { AgentInterpretationRequest, AgentInterpretationResult, AgentInterpreterKind, AgentInterpreterProvider } from '../domain/types/agent-interpreter';

// ─── Provider: Disabled (stub, always available) ───

function createDisabledProvider(): AgentInterpreterProvider {
  return {
    id: 'agent-interpreter-disabled',
    kind: 'disabled',
    interpret: () => Promise.resolve({
      interpreted: false,
      target: null,
      confidence: 0,
      rationale: 'Agent interpretation is disabled. Escalating to needs-human.',
      proposalDrafts: [],
      provider: 'disabled',
    }),
  };
}

// ─── Provider: Heuristic (context-aware scoring, no agent) ───
//
// Uses the same token-Jaccard + humanized identifier matching as the
// translation layer, but with FULL context: all screens, all elements,
// exhaustion trail, and prior resolution. This is NOT an agent — it's
// a richer scoring function that uses context to disambiguate.
//
// Useful as: baseline for A/B comparison, fallback when no agent session
// is available, fast path for CI/batch where LLM calls are too expensive.

/** Score a screen against the normalized intent. Higher = better match. */
function scoreScreen(
  normalized: string,
  screen: AgentInterpretationRequest['screens'][number],
): number {
  const aliases = [screen.screen, ...screen.screenAliases, humanizeIdentifier(screen.screen)];
  return bestAliasMatch(normalized, aliases)?.score ?? 0;
}

/** Score an element against the normalized intent. Higher = better match. */
function scoreElement(
  normalized: string,
  element: AgentInterpretationRequest['screens'][number]['elements'][number],
): number {
  const aliases = [element.element, element.name ?? '', ...element.aliases, humanizeIdentifier(element.element)];
  return bestAliasMatch(normalized, aliases)?.score ?? 0;
}

/** Infer action type from step text using keyword heuristics. */
function inferAction(actionText: string): StepAction {
  const lower = actionText.toLowerCase();
  if (/\b(navigate|go to|open|load|access|visit|browse)\b/.test(lower)) return 'navigate';
  if (/\b(enter|type|input|fill|set|provide|key in|write|populate)\b/.test(lower)) return 'input';
  if (/\b(click|press|tap|hit|activate|submit|trigger)\b/.test(lower)) return 'click';
  if (/\b(select|choose|pick)\b/.test(lower)) return 'click';
  if (/\b(verify|check|confirm|assert|ensure|see|observe|validate|expect)\b/.test(lower)) return 'assert-snapshot';
  return 'click';
}

function createHeuristicProvider(): AgentInterpreterProvider {
  return {
    id: 'agent-interpreter-heuristic',
    kind: 'heuristic',
    interpret: (request) => {
      const normalized = normalizeIntentText(`${request.actionText} ${request.expectedText}`);
      // Use grounding's allowedActions to constrain, falling back to keyword heuristic
      const allowedActions = request.grounding?.allowedActions;
      const action = request.inferredAction
        ?? (allowedActions && allowedActions.length === 1 ? allowedActions[0]! : null)
        ?? inferAction(request.actionText);

      // Single-pass max-finder for top screen. O(S) where S = screen count.
      // Use observedState.currentScreen for stronger disambiguation than priorTarget alone
      const priorScreen = request.observedState?.currentScreen
        ?? request.priorTarget?.screen
        ?? null;
      const topScreen = request.screens.reduce<{ screen: typeof request.screens[number]; score: number } | null>(
        (best, screen) => {
          const baseScore = scoreScreen(normalized, screen);
          const contextBonus = screen.screen === priorScreen ? 2.0 : 0;
          const score = baseScore + contextBonus;
          return score > 0 && (!best || score > best.score) ? { screen, score } : best;
        },
        null,
      );

      if (!topScreen) {
        return Promise.resolve({
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: 'No screen matched the step text with sufficient confidence.',
          proposalDrafts: [],
          provider: 'heuristic',
        });
      }

      // Single-pass max-finder for top element. O(E) where E = elements in winning screen.
      const topElement = topScreen.screen.elements.reduce<{ element: typeof topScreen.screen.elements[number]; score: number } | null>(
        (best, element) => {
          const score = scoreElement(normalized, element);
          return score > 0 && (!best || score > best.score) ? { element, score } : best;
        },
        null,
      );

      // For navigate actions, screen-only resolution is sufficient
      const needsElement = action !== 'navigate';
      if (needsElement && !topElement) {
        return Promise.resolve({
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: `Screen "${topScreen.screen.screen}" matched but no element matched for action "${action}".`,
          proposalDrafts: [],
          provider: 'heuristic',
        });
      }

      const confidence = Math.min(1, (topScreen.score + (topElement?.score ?? 0)) / 10);
      const target: ResolutionTarget = {
        action,
        screen: topScreen.screen.screen as ScreenId,
        element: (topElement?.element.element ?? null) as ElementId | null,
        posture: null as PostureId | null,
        override: null,
        snapshot_template: null as SnapshotTemplateId | null,
      };

      // Single-pass novel term detection via flatMap (collapsed from 3 chained filters)
      const normalizedScreenId = normalizeIntentText(topScreen.screen.screen);
      const normalizedElementId = normalizeIntentText(topElement?.element.element ?? '');
      const matchedAliases = new Set([
        ...(topScreen.screen.screenAliases),
        ...(topElement?.element.aliases ?? []),
      ].map(normalizeIntentText));

      const novelTerms = normalizeIntentText(request.actionText).split(/\s+/).flatMap((token) =>
        token.length > 3
          && !matchedAliases.has(token)
          && (normalizedScreenId.includes(token) || normalizedElementId.includes(token))
          ? [token]
          : [],
      );

      const proposalDrafts: ResolutionProposalDraft[] = novelTerms.length > 0 && topElement
        ? [{
            targetPath: `knowledge/screens/${topScreen.screen.screen}.hints.yaml`,
            title: `Add alias "${novelTerms[0]}" for ${topElement.element.element}`,
            patch: { op: 'add', path: `/elements/${topElement.element.element}/aliases/-`, value: novelTerms[0]! },
            artifactType: 'hints' as const,
            rationale: `Heuristic matched "${novelTerms[0]}" to ${topElement.element.element} via context-aware scoring.`,
          }]
        : [];

      return Promise.resolve({
        interpreted: true,
        target,
        confidence,
        rationale: `Heuristic resolved: screen=${topScreen.screen.screen}(score=${topScreen.score.toFixed(1)})${topElement ? ` element=${topElement.element.element}(score=${topElement.score.toFixed(1)})` : ''} action=${action}`,
        proposalDrafts,
        provider: 'heuristic',
        observation: {
          source: 'agent-interpreted' as const,
          summary: `Context-aware heuristic interpretation.`,
          detail: {
            screen: topScreen.screen.screen,
            element: topElement?.element.element ?? '',
            action,
            confidence: String(confidence),
          },
        },
      });
    },
  };
}

// ─── Provider: LLM API (Azure AI Foundry / OpenAI-compatible) ───

export interface AgentLlmApiDependencies {
  readonly createChatCompletion: (input: {
    readonly model: string;
    readonly maxTokens: number;
    readonly systemPrompt: string;
    readonly userMessage: string;
  }) => Promise<string>;
}

export interface AgentInterpreterConfig {
  readonly provider: AgentInterpreterKind;
  readonly model: string;
  readonly fallback: AgentInterpreterKind;
  readonly budget: {
    readonly maxTokensPerStep: number;
    readonly maxCallsPerRun: number;
  };
}

export const DEFAULT_AGENT_INTERPRETER_CONFIG: AgentInterpreterConfig = {
  provider: 'disabled',
  model: 'gpt-4o',
  fallback: 'disabled',
  budget: {
    maxTokensPerStep: 4000,
    maxCallsPerRun: 100,
  },
};

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

  // Enriched context sections (only included when present)
  const candidatesSection = request.topCandidates
    ? [
        '',
        'Prior rung rankings (confidence calibration):',
        ...request.topCandidates.screens.map((c) => `  screen "${c.screen}" scored ${c.score.toFixed(2)}`),
        ...request.topCandidates.elements.map((c) => `  element "${c.element}" on "${c.screen}" scored ${c.score.toFixed(2)}`),
      ]
    : [];

  const groundingSection = request.grounding
    ? [
        '',
        'Structural constraints:',
        ...(request.grounding.targetRefs.length > 0 ? [`  Target refs: ${request.grounding.targetRefs.join(', ')}`] : []),
        ...(request.grounding.requiredStateRefs.length > 0 ? [`  Required state: ${request.grounding.requiredStateRefs.join(', ')}`] : []),
        ...(request.grounding.forbiddenStateRefs.length > 0 ? [`  Forbidden state: ${request.grounding.forbiddenStateRefs.join(', ')}`] : []),
        `  Allowed actions: ${request.grounding.allowedActions.join(', ')}`,
      ]
    : [];

  const stateSection = request.observedState
    ? [
        '',
        'Current observed state:',
        ...(request.observedState.currentScreen ? [`  Active screen: ${request.observedState.currentScreen}`] : []),
        ...(request.observedState.activeStateRefs.length > 0 ? [`  Active states: ${request.observedState.activeStateRefs.join(', ')}`] : []),
        ...(request.observedState.lastSuccessfulLocatorRung !== null ? [`  Last successful locator rung: ${request.observedState.lastSuccessfulLocatorRung}`] : []),
      ]
    : [];

  const confidenceSection = request.confidenceHints && request.confidenceHints.length > 0
    ? [
        '',
        'Confidence overlay status:',
        ...request.confidenceHints.map((h) =>
          `  ${h.screen}${h.element ? `.${h.element}` : ''} → ${h.status} (${h.score.toFixed(2)})`,
        ),
      ]
    : [];

  return [
    'You are an intent interpretation agent for UI test automation.',
    'A QA tester wrote a test step. The deterministic resolution pipeline could not',
    'resolve it. Your job is to interpret what the tester meant and map it to a',
    'known screen, element, action, and posture.',
    '',
    'You have access to:',
    '1. The original step text (action + expected outcome)',
    '2. The available screens and elements with their aliases and widget types',
    '3. What the pipeline already tried and why each rung failed',
    request.domSnapshot ? '4. The current DOM state (ARIA snapshot)' : '',
    request.priorTarget ? `5. Prior step resolved to: screen=${request.priorTarget.screen}, element=${request.priorTarget.element}` : '',
    '',
    'Known screens and elements:',
    screenDescriptions,
    '',
    'Resolution attempts so far:',
    exhaustionSummary || '  (none)',
    ...candidatesSection,
    ...groundingSection,
    ...stateSection,
    ...confidenceSection,
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
    '',
    'If you cannot confidently interpret the step, set interpreted: false.',
    'Only set interpreted: true when you are confident in your interpretation.',
    'The suggestedAliases field should contain aliases that would help the',
    'deterministic pipeline resolve similar steps in the future.',
  ].filter(Boolean).join('\n');
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
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        interpreted: false,
        target: null,
        confidence: 0,
        rationale: 'No structured JSON found in agent response.',
        proposalDrafts: [],
        provider: providerId,
      };
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

    // Build proposal drafts for suggested aliases (feeds forward into knowledge)
    const proposalDrafts: ResolutionProposalDraft[] = (parsed.suggestedAliases ?? []).map((alias) => ({
      targetPath: parsed.screen && parsed.element
        ? `knowledge/screens/${parsed.screen}.hints.yaml`
        : parsed.screen
          ? `knowledge/screens/${parsed.screen}.hints.yaml`
          : '',
      title: `Add alias "${alias}" for ${parsed.element ?? parsed.screen}`,
      patch: {
        op: 'add' as const,
        path: parsed.element
          ? `/elements/${parsed.element}/aliases/-`
          : '/screenAliases/-',
        value: alias,
      },
      artifactType: 'hints' as const,
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
        source: 'agent-interpreted' as const,
        summary: parsed.rationale ?? 'Agent interpreted the step.',
        detail: {
          action: target.action,
          screen: target.screen,
          element: target.element ?? '',
          confidence: String(parsed.confidence ?? 0.5),
        },
      },
    };
  } catch {
    return {
      interpreted: false,
      target: null,
      confidence: 0,
      rationale: 'Failed to parse agent response.',
      proposalDrafts: [],
      provider: providerId,
    };
  }
}

function createLlmApiAgentProvider(
  config: AgentInterpreterConfig,
  deps: AgentLlmApiDependencies,
): AgentInterpreterProvider {
  return {
    id: `agent-llm-api-${config.model}`,
    kind: 'llm-api',
    interpret: async (request) => {
      try {
        const raw = await deps.createChatCompletion({
          model: config.model,
          maxTokens: config.budget.maxTokensPerStep,
          systemPrompt: buildAgentSystemPrompt(request),
          userMessage: buildAgentUserMessage(request),
        });
        return parseAgentResponse(raw, request, `llm-api-${config.model}`);
      } catch {
        return {
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: 'Agent LLM API call failed. Escalating to needs-human.',
          proposalDrafts: [],
          provider: `llm-api-${config.model}`,
        };
      }
    },
  };
}

// ─── Provider: Session (Claude Code CLI / VSCode Copilot / MCP) ───

/**
 * Session provider for interactive agent sessions.
 * Routes interpretation requests through the active agent runtime:
 *   - Claude Code: via the CLI session's tool invocation
 *   - VSCode Copilot: via vscode.lm.selectChatModels()
 *   - MCP: via tool server invocation
 *
 * The dependency injection follows the same pattern as the LLM API provider:
 * a `createChatCompletion` callback is injected at composition time by the
 * host environment, which routes to the appropriate agent backend.
 *
 * When no session agent is available, degrades to a stub that declines.
 */
function createSessionProvider(
  deps?: AgentLlmApiDependencies | undefined,
): AgentInterpreterProvider {
  if (!deps) {
    return {
      id: 'agent-session-stub',
      kind: 'session',
      interpret: () => Promise.resolve({
        interpreted: false,
        target: null,
        confidence: 0,
        rationale: 'No interactive agent session available. Escalating to needs-human.',
        proposalDrafts: [],
        provider: 'session-stub',
      }),
    };
  }

  return {
    id: 'agent-session-active',
    kind: 'session',
    interpret: async (request) => {
      try {
        const raw = await deps.createChatCompletion({
          model: 'session',
          maxTokens: 4000,
          systemPrompt: buildAgentSystemPrompt(request),
          userMessage: buildAgentUserMessage(request),
        });
        return parseAgentResponse(raw, request, 'session-agent');
      } catch {
        return {
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: 'Agent session call failed. Escalating to needs-human.',
          proposalDrafts: [],
          provider: 'session-agent',
        };
      }
    },
  };
}

// ─── W5.15: Effect.race Timeout for Agent Interpretation ───

/** Default timeout for agent interpretation calls (milliseconds). */
const DEFAULT_AGENT_TIMEOUT_MS = 30_000;

/** Fallback result returned when an agent call exceeds the token budget timeout. */
function timeoutFallbackResult(provider: string, budgetMs: number): AgentInterpretationResult {
  return {
    interpreted: false,
    target: null,
    confidence: 0,
    rationale: `Agent interpretation timed out after ${budgetMs}ms. Escalating to needs-human.`,
    proposalDrafts: [],
    provider,
    observation: {
      source: 'agent-interpreted' as const,
      summary: `Token budget exceeded: agent call did not complete within ${budgetMs}ms.`,
      detail: {
        reason: 'token-budget-exceeded',
        timeoutMs: String(budgetMs),
      },
    },
  };
}

/**
 * Wrap an agent interpretation call with Effect.race timeout.
 *
 * The agent LLM call races against a sleep timer. On timeout, returns a
 * `needs-human` result with `reason: 'token-budget-exceeded'`. Uses Effect
 * fiber interruption semantics — no leaked timers.
 *
 * Can be composed around any `AgentInterpreterProvider.interpret` call.
 */
export function withAgentTimeout(
  interpret: (request: AgentInterpretationRequest) => Promise<AgentInterpretationResult>,
  options?: { readonly budgetMs?: number; readonly provider?: string },
): (request: AgentInterpretationRequest) => Promise<AgentInterpretationResult> {
  const budgetMs = options?.budgetMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  const providerId = options?.provider ?? 'agent-timeout-wrapper';

  return (request) => {
    const agentCall = Effect.tryPromise({
      try: () => interpret(request),
      catch: (err) => err instanceof Error ? err : new Error(String(err)),
    });

    const timeoutSignal = Effect.sleep(Duration.millis(budgetMs)).pipe(
      Effect.map(() => timeoutFallbackResult(providerId, budgetMs)),
    );

    const raced = Effect.race(agentCall, timeoutSignal).pipe(
      Effect.catchAll(() => Effect.succeed(timeoutFallbackResult(providerId, budgetMs))),
    );

    return Effect.runPromise(raced);
  };
}

/**
 * Create a timeout-bounded agent interpreter provider.
 *
 * Wraps an existing provider so that every `interpret` call races against
 * the configured budget. The budget defaults to the provider config's
 * `maxTokensPerStep * 8` ms (heuristic: ~8ms per token for typical LLM
 * latency) or 30 seconds, whichever is smaller.
 */
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
    interpret: withAgentTimeout(
      (request) => provider.interpret(request),
      { budgetMs, provider: provider.id },
    ),
  };
}

// ─── Composite Provider (session → llm-api fallback) ───

function createCompositeAgentProvider(
  primary: AgentInterpreterProvider,
  fallback: AgentInterpreterProvider,
): AgentInterpreterProvider {
  return {
    id: `composite-${primary.id}-${fallback.id}`,
    kind: primary.kind,
    interpret: async (request) => {
      const primaryResult = await primary.interpret(request);
      return primaryResult.interpreted
        ? primaryResult
        : fallback.interpret(request);
    },
  };
}

// ─── Provider Factory ───

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
      return deps
        ? createLlmApiAgentProvider(config, deps)
        : createDisabledProvider();
    case 'session':
      return createSessionProvider(deps);
  }
}

/**
 * Resolve the appropriate AgentInterpreterProvider based on configuration.
 *
 * Selection precedence:
 *   1. Session agent (if available) — Claude Code, VSCode Copilot, MCP
 *   2. LLM API (if configured) — Azure AI Foundry
 *   3. Disabled (always available) — escalate to needs-human
 *
 * The provider can be overridden via:
 *   - PipelineConfig.agentInterpreter.provider
 *   - CLI flag --agent-provider
 *   - Environment variable TESSERACT_AGENT_PROVIDER
 */
export function resolveAgentInterpreterProvider(
  config?: AgentInterpreterConfig | undefined,
  deps?: AgentLlmApiDependencies | undefined,
  abTestConfig?: ABTestConfig | undefined,
  providerOverride?: AgentInterpreterKind | undefined,
): AgentInterpreterProvider {
  const effectiveConfig = config ?? DEFAULT_AGENT_INTERPRETER_CONFIG;

  const providerKind = providerOverride ?? effectiveConfig.provider;
  const fallbackKind = effectiveConfig.fallback;

  const rawPrimary = createAgentProviderByKind(providerKind, effectiveConfig, deps);
  const rawFallback = providerKind !== fallbackKind
    ? createAgentProviderByKind(fallbackKind, effectiveConfig, deps)
    : null;

  // Apply timeout bounds to non-disabled providers (W5.15)
  const primary = rawPrimary.kind !== 'disabled'
    ? createTimeoutBoundedProvider(rawPrimary, effectiveConfig)
    : rawPrimary;
  const fallback = rawFallback && rawFallback.kind !== 'disabled'
    ? createTimeoutBoundedProvider(rawFallback, effectiveConfig)
    : rawFallback;

  const resolved = fallback
    ? createCompositeAgentProvider(primary, fallback)
    : primary;

  // When A/B test config is provided, wrap in a variant-assigning provider.
  // The control variant uses the heuristic provider; treatment uses the
  // resolved (possibly LLM-backed) provider. Assignment is deterministic
  // per step index via the hash seed in ABTestConfig.
  return abTestConfig
    ? createABTestingProvider(resolved, abTestConfig, effectiveConfig, deps)
    : resolved;
}

// ─── A/B Testing Provider ───

/**
 * Create a provider that routes per-step to control or treatment based on
 * deterministic variant assignment. Control uses heuristic; treatment uses
 * the provided primary provider. This enables controlled comparison of
 * resolution quality between provider strategies.
 */
function createABTestingProvider(
  treatmentProvider: AgentInterpreterProvider,
  abTestConfig: ABTestConfig,
  config: AgentInterpreterConfig,
  _deps?: AgentLlmApiDependencies,
): AgentInterpreterProvider {
  const controlProvider = createAgentProviderByKind(
    abTestConfig.controlProvider as AgentInterpreterKind,
    config,
  );

  return {
    id: `ab-test-${abTestConfig.testId}`,
    kind: treatmentProvider.kind,
    interpret: async (request) => {
      // Use step index extracted from task fingerprint for deterministic routing.
      // The request doesn't directly expose stepIndex, so we hash the fingerprint.
      const stepHash = request.taskFingerprint
        .split('')
        .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
      const variant = assignVariant(Math.abs(stepHash), abTestConfig);
      const provider = variant === 'treatment' ? treatmentProvider : controlProvider;
      const result = await provider.interpret(request);
      return {
        ...result,
        provider: `${result.provider}:${variant}`,
      };
    },
  };
}
