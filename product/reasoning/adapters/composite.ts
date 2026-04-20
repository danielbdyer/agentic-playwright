/**
 * Composite adapter: bridges v1 providers into the unified Reasoning port.
 *
 * v1 split the proto-Reasoning surface across `TranslationProvider`
 * (rung 5) and `AgentInterpreterPort` (rung 9). v2 unifies them behind
 * a single `Reasoning.Tag`. This adapter is the composition point:
 * it consumes an existing TranslationProvider + AgentInterpreterPort
 * (including whatever layered Composite / Hybrid / retry shells the
 * callsites constructed) and exposes them as `select` / `interpret`
 * operations with unified receipt envelopes.
 *
 * `synthesize` lands as a no-op until a production caller needs it.
 * The port shape per 4b.B.1 is fixed; first synthesis adapter will
 * populate this slot without shape churn.
 *
 * Receipt envelope population:
 * - `provider` threads the underlying provider id.
 * - `model` is empty for legacy providers (the v1 providers didn't
 *   surface model ids on the strategy interface). Direct adapters
 *   that land in later commits will populate this from their
 *   adapter-specific config.
 * - `tokens` is ZERO_TOKENS — v1 providers don't report token usage
 *   at the strategy interface. Workshop's metric visitor treats
 *   all-zero as "not reported" and excludes from the p50 calculation.
 * - `promptFingerprint` is empty — same rationale. Direct adapters
 *   compute this from the prompt structure; the composite here has no
 *   access to the underlying prompt.
 * - `latencyMs` is measured at the composite boundary (includes the
 *   full legacy provider chain, retries, composite/hybrid fallbacks).
 *
 * The one-way flow (legacy → unified) is intentional. Adapters that
 * need to feed a unified `Reasoning` implementation back into the v1
 * interfaces have no production path — saga migrations move forward
 * from this bridge, not back through it.
 */

import { Effect } from 'effect';
import type { AgentInterpretationResult } from '../../domain/interpretation/agent-interpreter';
import type { AgentInterpreterPort } from '../../domain/resolution/model';
import type { TranslationProvider } from '../translation-provider';
import {
  Reasoning,
  ZERO_TOKENS,
  buildReceipt,
  type ReasoningReceipt,
  type ReasoningService,
  type SelectRequest,
  type SynthesisPayload,
  type SynthesisRequest,
} from '../reasoning';

type EffectfulAgentPort = AgentInterpreterPort<Effect.Effect<AgentInterpretationResult, never, never>>;

export interface CompositeReasoningDependencies {
  readonly translation: TranslationProvider;
  readonly agent: EffectfulAgentPort;
}

/**
 * Build a Reasoning adapter from a TranslationProvider + Effectful
 * AgentInterpreterPort pair. The two inputs are already-composed
 * legacy providers; this function wraps them into the unified port
 * without further behavior change.
 */
export function createCompositeReasoning(deps: CompositeReasoningDependencies): ReasoningService {
  const { translation, agent } = deps;

  const select = (request: SelectRequest): Effect.Effect<ReasoningReceipt<'select'>, never, never> =>
    Effect.gen(function* () {
      const start = Date.now();
      const payload = yield* translation.translate(request);
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

  const synthesize = (_request: SynthesisRequest): Effect.Effect<ReasoningReceipt<'synthesize'>, never, never> => {
    const payload: SynthesisPayload = {
      text: '',
      stopReason: 'error',
    };
    return Effect.succeed(
      buildReceipt({
        op: 'synthesize',
        provider: 'composite-no-op',
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: 0,
        promptFingerprint: '',
        payload,
      }),
    );
  };

  return {
    select,
    interpret,
    synthesize,
  } satisfies ReasoningService;
}

/** Reference guard — ensures the Reasoning import isn't tree-shaken by tools
 *  that don't yet see a callsite consuming the tag. */
export const __compositeReasoningTag = Reasoning;
