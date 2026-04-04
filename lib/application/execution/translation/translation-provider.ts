/**
 * TranslationProvider — Strategy pattern for pluggable translation backends.
 *
 * Three provider implementations share a single contract:
 *   1. deterministic — token-overlap scoring (free, always available)
 *   2. llm-api — OpenAI-compatible API (Azure OpenAI / Azure AI Foundry; token cost, requires config)
 *   3. mcp-tool — MCP tool invocation (future; stub)
 *
 * The hybrid provider composes deterministic + fallback using the Composite pattern:
 * try deterministic first, escalate to LLM only when no confident match.
 *
 * Resolution precedence: the translate callback is invoked at rung 5
 * (structured-translation) of the resolution ladder. Rungs 1–4 are deterministic
 * and never touch this code. Rung 6 (live-dom) is a separate concern.
 */

import { Effect } from 'effect';
import { translateIntentToOntology } from './translate';
import type { TranslationReceipt, TranslationRequest, ExecutionProfile } from '../../../domain/types';
import type { ElementId, ScreenId } from '../../../domain/kernel/identity';
import {
  translationProviderError,
  translationProviderParseError,
  type TranslationProviderParseError,
  type TranslationProviderTimeoutError,
} from '../../../domain/kernel/errors';
import {
  RETRY_POLICIES,
  formatRetryMetadata,
  retryMetadata,
  retryScheduleForTaggedErrors,
} from '../../resilience/schedules';

// ─── Provider Contract (Strategy interface) ───

export type TranslationProviderKind = 'deterministic' | 'llm-api' | 'copilot';

export interface TranslationProvider {
  readonly id: string;
  readonly kind: TranslationProviderKind;
  readonly translate: (request: TranslationRequest) => Effect.Effect<TranslationReceipt, never, never>;
}

// ─── Translation Configuration ───

export interface TranslationBudget {
  readonly maxTokensPerStep: number;
  readonly maxCallsPerRun: number;
}

export interface TranslationConfig {
  readonly provider: TranslationProviderKind;
  readonly model: string;
  readonly fallback: TranslationProviderKind;
  readonly cache: boolean;
  readonly budget: TranslationBudget;
}

export const DEFAULT_TRANSLATION_CONFIG: TranslationConfig = {
  provider: 'deterministic',
  model: 'gpt-4o',
  fallback: 'deterministic',
  cache: true,
  budget: {
    maxTokensPerStep: 2000,
    maxCallsPerRun: 50,
  },
};

// ─── Provider: Deterministic (token-overlap) ───

function createDeterministicProvider(): TranslationProvider {
  return {
    id: 'deterministic-token-overlap',
    kind: 'deterministic',
    translate: (request) => Effect.succeed(translateIntentToOntology(request)),
  };
}

// ─── Provider: LLM API (OpenAI-compatible — Azure OpenAI / Azure AI Foundry) ───

export interface LlmApiProviderDependencies {
  readonly createChatCompletion: (input: {
    readonly model: string;
    readonly maxTokens: number;
    readonly systemPrompt: string;
    readonly userMessage: string;
  }) => Promise<string>;
}

function buildTranslationSystemPrompt(request: TranslationRequest): string {
  const screenDescriptions = request.screens.map((screen) => {
    const elements = screen.elements.map((el) =>
      `  - element: "${el.element}" (aliases: ${el.aliases.join(', ')})`,
    ).join('\n');
    return `Screen: "${screen.screen}" (aliases: ${screen.aliases.join(', ')})\n${elements}`;
  }).join('\n\n');

  return [
    'You are a structured translation engine for UI test automation.',
    'Given a test step instruction and a set of known screens and elements,',
    'select the best matching screen and element from the candidates.',
    '',
    'Respond with a JSON object:',
    '{ "matched": true/false, "screen": "screenId", "element": "elementId"|null, "score": 0.0-1.0, "rationale": "..." }',
    '',
    `Allowed actions: ${request.allowedActions.join(', ')}`,
    '',
    'Known screens and elements:',
    screenDescriptions,
  ].join('\n');
}

function buildTranslationUserMessage(request: TranslationRequest): string {
  return [
    `Action: ${request.actionText}`,
    `Expected: ${request.expectedText}`,
    `Normalized intent: ${request.normalizedIntent}`,
  ].join('\n');
}

interface LlmTranslationResponse {
  readonly matched: boolean;
  readonly screen: string | null;
  readonly element: string | null;
  readonly score: number;
  readonly rationale: string;
}

function parseLlmResponse(raw: string, request: TranslationRequest): TranslationReceipt {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw translationProviderParseError(new Error('No structured JSON found in LLM response.'), 'llm-api');
  }
  const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmTranslationResponse>;

  if (!parsed.matched || !parsed.screen) {
    return {
      kind: 'translation-receipt',
      version: 1,
      mode: 'structured-translation',
      matched: false,
      selected: null,
      candidates: [],
      rationale: parsed.rationale ?? 'LLM could not match the step to a known target.',
      failureClass: 'no-candidate',
    };
  }

  const screen = request.screens.find((s) => s.screen === parsed.screen);
  const element = parsed.element
    ? screen?.elements.find((e) => e.element === parsed.element)
    : null;

  const candidate = element
    ? {
        kind: 'element' as const,
        target: `${parsed.screen}.${parsed.element}`,
        screen: parsed.screen as ScreenId,
        element: parsed.element as ElementId,
        aliases: element.aliases,
        score: Math.min(1, Math.max(0, parsed.score ?? 0.5)),
        sourceRefs: request.overlayRefs,
      }
    : {
        kind: 'screen' as const,
        target: parsed.screen,
        screen: parsed.screen as ScreenId,
        aliases: screen?.aliases ?? [],
        score: Math.min(1, Math.max(0, parsed.score ?? 0.5)),
        sourceRefs: request.overlayRefs,
      };

  return {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: true,
    selected: candidate,
    candidates: [candidate],
    rationale: parsed.rationale ?? 'LLM matched the step to a known target.',
    failureClass: 'none',
  };
}

function translationProviderFailureReceipt(rationale: string): TranslationReceipt {
  return {
    kind: 'translation-receipt',
    version: 1,
    mode: 'structured-translation',
    matched: false,
    selected: null,
    candidates: [],
    rationale,
    failureClass: 'translator-error',
  };
}

function withTranslationRetries(
  providerId: string,
  run: () => Promise<string>,
): Effect.Effect<string, ReturnType<typeof translationProviderError>> {
  const startedAt = Date.now();
  let attempts = 0;
  const retryPolicy = RETRY_POLICIES.translationTimeout;
  return Effect.tryPromise({
    try: async () => {
      attempts += 1;
      return run();
    },
    catch: (cause) => translationProviderError(cause, providerId),
  }).pipe(
    Effect.retryOrElse(
      retryScheduleForTaggedErrors(retryPolicy, (error) => error._tag === 'TranslationProviderTimeoutError'),
      (error) => Effect.fail(error),
    ),
    Effect.catchTag('TranslationProviderTimeoutError', (error: TranslationProviderTimeoutError) =>
      Effect.fail(translationProviderError(
        new Error(`${error.message} (${formatRetryMetadata(retryMetadata(retryPolicy, attempts, startedAt, true))})`),
        providerId,
      ))),
  );
}

function createLlmApiProvider(
  config: TranslationConfig,
  deps: LlmApiProviderDependencies,
): TranslationProvider {
  return {
    id: `llm-api-${config.model}`,
    kind: 'llm-api',
    translate: (request) => withTranslationRetries(
        `llm-api-${config.model}`,
        () => deps.createChatCompletion({
          model: config.model,
          maxTokens: config.budget.maxTokensPerStep,
          systemPrompt: buildTranslationSystemPrompt(request),
          userMessage: buildTranslationUserMessage(request),
        }),
      ).pipe(
        Effect.flatMap((raw) => Effect.try({
          try: () => parseLlmResponse(raw, request),
          catch: (cause) => translationProviderError(cause, `llm-api-${config.model}`),
        })),
        Effect.catchTag('TranslationProviderTimeoutError', (error: TranslationProviderTimeoutError) =>
          Effect.succeed(translationProviderFailureReceipt(
            `LLM API timed out (${error.message}). Degrading to next resolution rung.`,
          ))),
        Effect.catchTag('TranslationProviderParseError', (error: TranslationProviderParseError) =>
          Effect.succeed(translationProviderFailureReceipt(
            `LLM response parse failed (${error.message}). Degrading to next resolution rung.`,
          ))),
        Effect.catchAll((error) =>
          Effect.succeed(translationProviderFailureReceipt(
            `LLM API call failed (${String(error)}). Degrading to next resolution rung.`,
          ))),
      ),
  };
}

// ─── Provider: Copilot (GitHub Copilot via VSCode extension) ───

/**
 * Copilot provider for interactive sessions via VSCode Copilot extension.
 * Routes translation requests through VSCode's language model API (vscode.lm).
 * When running outside VSCode, degrades to a stub that signals runtime-disabled.
 *
 * The dependency injection follows the same pattern as llm-api:
 * a `createChatCompletion` callback is injected at composition time by the
 * VSCode extension host, which routes through `vscode.lm.selectChatModels()`.
 */
function createCopilotProvider(
  deps?: LlmApiProviderDependencies | undefined,
): TranslationProvider {
  if (!deps) {
    return {
      id: 'copilot-stub',
      kind: 'copilot',
      translate: () => Effect.succeed({
        kind: 'translation-receipt' as const,
        version: 1 as const,
        mode: 'structured-translation' as const,
        matched: false,
        selected: null,
        candidates: [],
        rationale: 'Copilot provider not available outside VSCode.',
        failureClass: 'runtime-disabled' as const,
      }),
    };
  }

  return {
    id: 'copilot-vscode',
    kind: 'copilot',
    translate: (request) => withTranslationRetries(
        'copilot',
        () => deps.createChatCompletion({
          model: 'copilot',
          maxTokens: 2000,
          systemPrompt: buildTranslationSystemPrompt(request),
          userMessage: buildTranslationUserMessage(request),
        }),
      ).pipe(
        Effect.flatMap((raw) => Effect.try({
          try: () => parseLlmResponse(raw, request),
          catch: (cause) => translationProviderError(cause, 'copilot'),
        })),
        Effect.catchTag('TranslationProviderTimeoutError', (error: TranslationProviderTimeoutError) =>
          Effect.succeed(translationProviderFailureReceipt(
            `Copilot API timed out (${error.message}). Degrading to next resolution rung.`,
          ))),
        Effect.catchTag('TranslationProviderParseError', (error: TranslationProviderParseError) =>
          Effect.succeed(translationProviderFailureReceipt(
            `Copilot response parse failed (${error.message}). Degrading to next resolution rung.`,
          ))),
        Effect.catchAll((error) =>
          Effect.succeed(translationProviderFailureReceipt(
            `Copilot API call failed (${String(error)}). Degrading to next resolution rung.`,
          ))),
      ),
  };
}

// ─── Hybrid Provider (Composite: deterministic → LLM fallback) ───

function createHybridProvider(
  primary: TranslationProvider,
  fallback: TranslationProvider,
): TranslationProvider {
  return {
    id: `hybrid-${primary.id}-${fallback.id}`,
    kind: fallback.kind,
    translate: (request) => Effect.gen(function* () {
      const primaryResult = yield* primary.translate(request);
      return primaryResult.matched
        ? primaryResult
        : yield* fallback.translate(request);
    }),
  };
}

// ─── Provider Factory ───

function createProviderByKind(
  kind: TranslationProviderKind,
  config: TranslationConfig,
  deps?: LlmApiProviderDependencies,
): TranslationProvider {
  switch (kind) {
    case 'deterministic':
      return createDeterministicProvider();
    case 'llm-api':
      return deps
        ? createLlmApiProvider(config, deps)
        : createDeterministicProvider();
    case 'copilot':
      return createCopilotProvider(deps);
  }
}

/**
 * Resolve the appropriate TranslationProvider based on configuration and execution profile.
 *
 * Rules:
 * - ci-batch always uses deterministic (never LLM)
 * - dogfood uses configured provider with deterministic fallback
 * - interactive uses configured provider with deterministic fallback
 * - When provider is 'llm-api' but no deps provided, degrades to deterministic
 * - When provider is not 'deterministic', wraps in hybrid (deterministic first, then configured)
 */
export function resolveTranslationProvider(input: {
  readonly config: TranslationConfig;
  readonly profile: ExecutionProfile;
  readonly llmDeps?: LlmApiProviderDependencies | undefined;
}): TranslationProvider {
  const { config, profile, llmDeps } = input;

  // ci-batch: always deterministic, no LLM
  if (profile === 'ci-batch') {
    return createDeterministicProvider();
  }

  const primary = createDeterministicProvider();
  const configured = createProviderByKind(config.provider, config, llmDeps);

  // If configured provider is deterministic, no need for hybrid
  return configured.kind === 'deterministic'
    ? primary
    : createHybridProvider(primary, configured);
}

// ─── Exports for testing ───

export {
  createDeterministicProvider,
  createLlmApiProvider,
  createCopilotProvider,
  createHybridProvider,
  buildTranslationSystemPrompt,
  buildTranslationUserMessage,
  parseLlmResponse,
};
