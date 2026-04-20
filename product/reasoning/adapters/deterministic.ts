/**
 * Deterministic Reasoning adapter — zero-cost fallback.
 *
 * Always-available implementation for `ci-batch` execution profile
 * and for test scaffolding. `select` routes through the existing
 * `translateIntentToOntology` (token-Jaccard scoring); `interpret`
 * returns an interpreted=false receipt; `synthesize` returns an
 * empty-text receipt.
 *
 * No LLM calls. No retry loops. Deterministic by construction — the
 * v1 `createDeterministicProvider` surface inherited into the unified
 * port.
 */

import { Effect } from 'effect';
import { translateIntentToOntology } from '../translate';
import {
  Reasoning,
  ZERO_TOKENS,
  buildReceipt,
  type InterpretRequest,
  type ReasoningReceipt,
  type ReasoningService,
  type SelectRequest,
  type SynthesisRequest,
} from '../reasoning';

const PROVIDER_ID = 'deterministic-token-overlap';

export function createDeterministicReasoning(): ReasoningService {
  const select = (request: SelectRequest): Effect.Effect<ReasoningReceipt<'select'>, never, never> => {
    const start = Date.now();
    const payload = translateIntentToOntology(request);
    return Effect.succeed(
      buildReceipt({
        op: 'select',
        provider: PROVIDER_ID,
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: Date.now() - start,
        promptFingerprint: '',
        payload,
      }),
    );
  };

  const interpret = (_request: InterpretRequest): Effect.Effect<ReasoningReceipt<'interpret'>, never, never> => {
    return Effect.succeed(
      buildReceipt({
        op: 'interpret',
        provider: PROVIDER_ID,
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: 0,
        promptFingerprint: '',
        payload: {
          interpreted: false,
          target: null,
          confidence: 0,
          rationale: 'Deterministic Reasoning adapter does not attempt agent interpretation.',
          proposalDrafts: [],
          provider: PROVIDER_ID,
        },
      }),
    );
  };

  const synthesize = (_request: SynthesisRequest): Effect.Effect<ReasoningReceipt<'synthesize'>, never, never> => {
    return Effect.succeed(
      buildReceipt({
        op: 'synthesize',
        provider: PROVIDER_ID,
        model: '',
        tokens: ZERO_TOKENS,
        latencyMs: 0,
        promptFingerprint: '',
        payload: { text: '', stopReason: 'error' },
      }),
    );
  };

  return { select, interpret, synthesize } satisfies ReasoningService;
}

export const deterministicReasoningProviderId = PROVIDER_ID;

/** Reference guard against tree-shaking. */
export const __deterministicReasoningTag = Reasoning;
