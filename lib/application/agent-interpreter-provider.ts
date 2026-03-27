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

import type { ResolutionTarget, ResolutionProposalDraft, ResolutionObservation } from '../domain/types';
import type { StepAction } from '../domain/types';
import type { ScreenId, ElementId, PostureId, SnapshotTemplateId } from '../domain/identity';
import { normalizeIntentText } from '../domain/inference';
import { bestAliasMatch, humanizeIdentifier } from '../runtime/agent/shared';

// ─── Request / Response Contract ───

export interface AgentInterpretationRequest {
  /** Original step text from the QA test case. */
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  /** Inferred action type from prior rungs (may be null if unknown). */
  readonly inferredAction: StepAction | null;
  /** Available screens with their elements, aliases, and widget contracts. */
  readonly screens: ReadonlyArray<{
    readonly screen: string;
    readonly screenAliases: readonly string[];
    readonly elements: ReadonlyArray<{
      readonly element: string;
      readonly name: string | null;
      readonly aliases: readonly string[];
      readonly widget: string;
      readonly role: string;
    }>;
  }>;
  /** What prior resolution rungs attempted and why they failed. */
  readonly exhaustionTrail: ReadonlyArray<{
    readonly stage: string;
    readonly outcome: string;
    readonly reason: string;
  }>;
  /** DOM context: ARIA snapshot of the current page state (if available). */
  readonly domSnapshot: string | null;
  /** Prior resolution for context (e.g., what screen we're already on). */
  readonly priorTarget: ResolutionTarget | null;
  /** Task fingerprint for caching. */
  readonly taskFingerprint: string;
  /** Knowledge fingerprint for cache invalidation. */
  readonly knowledgeFingerprint: string;

  // ─── Enriched context (Gap 1: agent sees what prior rungs learned) ───

  /** Top-3 ranked candidates from prior rungs. Enables confidence calibration —
   *  if all screens scored < 0.2, agent should decline. If screen #1 scored 0.95
   *  and #2 scored 0.94, agent knows it's a near-tie. */
  readonly topCandidates?: {
    readonly screens: ReadonlyArray<{ readonly screen: string; readonly score: number }>;
    readonly elements: ReadonlyArray<{ readonly element: string; readonly screen: string; readonly score: number }>;
  } | undefined;

  /** Structural grounding from the compiled step. Constrains search space:
   *  targetRefs narrow candidates, requiredStateRefs validate preconditions,
   *  forbiddenStateRefs reject unsafe targets, allowedActions filter inference. */
  readonly grounding?: {
    readonly targetRefs: readonly string[];
    readonly requiredStateRefs: readonly string[];
    readonly forbiddenStateRefs: readonly string[];
    readonly allowedActions: readonly StepAction[];
  } | undefined;

  /** Current observed state from working memory. Enables filtering candidates
   *  to visible/enabled elements on the current screen. */
  readonly observedState?: {
    readonly currentScreen: string | null;
    readonly activeStateRefs: readonly string[];
    readonly lastSuccessfulLocatorRung: number | null;
  } | undefined;

  /** Per-artifact confidence status for top overlays. Agent knows whether
   *  targets are trusted (approved-equivalent) or exploratory (learning). */
  readonly confidenceHints?: ReadonlyArray<{
    readonly screen: string;
    readonly element?: string | undefined;
    readonly status: 'approved-equivalent' | 'learning' | 'needs-review';
    readonly score: number;
  }> | undefined;
}

export interface AgentInterpretationResult {
  readonly interpreted: boolean;
  readonly target: ResolutionTarget | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly proposalDrafts: readonly ResolutionProposalDraft[];
  readonly observation?: ResolutionObservation | undefined;
  readonly provider: string;
}

// ─── Provider Contract (Strategy interface) ───

export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

export interface AgentInterpreterProvider {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (request: AgentInterpretationRequest) => Promise<AgentInterpretationResult>;
}

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
): AgentInterpreterProvider {
  const effectiveConfig = config ?? DEFAULT_AGENT_INTERPRETER_CONFIG;

  const envOverride = process.env.TESSERACT_AGENT_PROVIDER as AgentInterpreterKind | undefined;
  const providerKind = envOverride ?? effectiveConfig.provider;
  const fallbackKind = effectiveConfig.fallback;

  const primary = createAgentProviderByKind(providerKind, effectiveConfig, deps);
  const fallback = providerKind !== fallbackKind
    ? createAgentProviderByKind(fallbackKind, effectiveConfig, deps)
    : null;

  return fallback
    ? createCompositeAgentProvider(primary, fallback)
    : primary;
}
