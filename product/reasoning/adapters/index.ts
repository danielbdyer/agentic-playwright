/**
 * Reasoning adapter registry (v2 §3.6 + readiness §9.6).
 *
 * Every first-party `Reasoning` implementation is composed and
 * exported from this file. Callers at composition time select an
 * adapter via `Layer.succeed(Reasoning, <adapter>)`.
 *
 * Adapter priority per §9.6:
 *
 *   1. `ci-batch` profile → `createDeterministicReasoning()` —
 *      zero-cost, always available.
 *   2. Interactive / dogfood → `createReasoning({ translation, agent })`
 *      composing the strategy backends (translation-backends.ts +
 *      agent-backends.ts). The backends route to the deterministic,
 *      llm-api, copilot, or session implementations per config.
 *
 * The ReasoningReceipt envelope population (tokens, latencyMs,
 * promptFingerprint) happens at the boundary here — the internal
 * backends return their legacy receipt payloads; this factory wraps
 * them in the unified envelope. Direct Copilot / Azure adapters that
 * populate token counts and prompt fingerprints from provider
 * telemetry land as their own factories in this folder when the
 * backing providers publish those fields.
 */

import { Effect } from 'effect';
import {
  Reasoning,
  ZERO_TOKENS,
  buildReceipt,
  type ReasoningReceipt,
  type ReasoningService,
  type SelectRequest,
  type SynthesisRequest,
} from '../reasoning';
import type { AgentInterpretationResult } from '../../domain/interpretation/agent-interpreter';
import type { AgentInterpreterPort } from '../../domain/resolution/model';
import type { TranslationProvider } from './translation-backends';

export { createDeterministicReasoning, deterministicReasoningProviderId } from './deterministic';
export {
  DEFAULT_TRANSLATION_CONFIG,
  resolveTranslationProvider,
  type LlmApiProviderDependencies,
  type TranslationConfig,
  type TranslationProvider,
  type TranslationProviderKind,
} from './translation-backends';
export {
  DEFAULT_AGENT_INTERPRETER_CONFIG,
  createScopedLlmApiAgentProvider,
  createScopedSessionProvider,
  createTimeoutBoundedProvider,
  resolveAgentInterpreterPort,
  resolveAgentInterpreterProvider,
  withAgentTimeout,
  withAgentTimeoutEffect,
  type AgentInterpreterConfig,
  type AgentInterpreterProvider,
  type AgentLlmApiDependencies,
  type VisionImage,
} from './agent-backends';

type EffectfulAgentInterpreterPort = AgentInterpreterPort<Effect.Effect<AgentInterpretationResult, never, never>>;

export interface ReasoningDependencies {
  readonly translation: TranslationProvider;
  readonly agent: EffectfulAgentInterpreterPort;
}

/**
 * Build a Reasoning adapter by composing a translation backend + an
 * agent-interpreter backend into the unified `ReasoningService`.
 * `synthesize` returns a no-op receipt until a first-class synthesis
 * backend lands.
 *
 * Receipt envelope population:
 * - `provider` = the backend's id.
 * - `model` = '' (the backends don't surface model ids on the
 *   strategy interface). Direct adapters that bypass these backends
 *   populate the field from their own config.
 * - `tokens` = ZERO_TOKENS (backends don't report counts). Direct
 *   adapters populate from provider telemetry.
 * - `promptFingerprint` = '' (same rationale).
 * - `latencyMs` measured at this boundary (includes backend retries
 *   and hybrid fallbacks).
 */
export function createReasoning(deps: ReasoningDependencies): ReasoningService {
  const { translation, agent } = deps;

  const select = (request: SelectRequest): Effect.Effect<ReasoningReceipt<'select'>, never, never> =>
    Effect.gen(function* () {
      const start = Date.now();
      const payload = yield* translation.select(request);
      return buildReceipt({
        op: 'select',
        provider: translation.id,
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: Date.now() - start,
        promptFingerprint: '',
        payload,
      });
    });

  const interpret = (request: Parameters<typeof agent.interpret>[0]): Effect.Effect<ReasoningReceipt<'interpret'>, never, never> =>
    Effect.gen(function* () {
      const start = Date.now();
      const payload = yield* agent.interpret(request);
      return buildReceipt({
        op: 'interpret',
        provider: agent.id,
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: Date.now() - start,
        promptFingerprint: '',
        payload,
      });
    });

  const synthesize = (_request: SynthesisRequest): Effect.Effect<ReasoningReceipt<'synthesize'>, never, never> =>
    Effect.succeed(
      buildReceipt({
        op: 'synthesize',
        provider: 'reasoning-no-op',
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: 0,
        promptFingerprint: '',
        payload: { text: '', stopReason: 'error' },
      }),
    );

  return { select, interpret, synthesize } satisfies ReasoningService;
}

/** Reference guard against tree-shaking of the Reasoning Tag. */
export const __reasoningTag = Reasoning;
