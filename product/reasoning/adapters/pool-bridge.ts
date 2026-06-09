/**
 * Pool bridge — pure translation between the Reasoning port's
 * per-op requests and the reasoning-pool's envelopes (Z11d.b).
 *
 * Two directions:
 *   - `buildPendingRequest` renders an op request into the
 *     `PendingRequest` a RecordReasoning adapter persists. Prompt
 *     text reuses the SAME builders the live LLM backends use
 *     (`buildTranslationSystemPrompt`, `buildAgentSystemPrompt`) —
 *     one prompt truth, two transports (plan §1.3: no parallel
 *     prompt copies to drift).
 *   - `parseFillIntoPayload` interprets a `FilledResponse` back
 *     into the op's payload, reusing the SAME parsers the live
 *     backends use (`parseLlmResponse`, `parseAgentResponse`).
 *
 * Pure: no IO, no Effect. Fingerprint stability is inherited from
 * the prompt builders' determinism over their request — both
 * builders are pure functions of the request value.
 */

import { Either } from 'effect';
import { ReasoningError } from '../../domain/kernel/errors';
import type {
  InterpretRequest,
  ReasoningOp,
  ReasoningPayloadByOp,
  ReasoningRequestByOp,
  SelectRequest,
  SynthesisRequest,
} from '../reasoning';
import { promptFingerprint } from '../pool/fingerprint';
import type { FilledResponse } from '../pool/filled-response';
import { filledSchemaMismatch, type PoolError } from '../pool/errors';
import type { PendingRequest } from '../pool/pending-request';
import {
  buildTranslationSystemPrompt,
  buildTranslationUserMessage,
  parseLlmResponse,
} from './translation-backends';
import {
  buildAgentSystemPrompt,
  buildAgentUserMessage,
  parseAgentResponse,
} from './agent-backends';

export const CLAUDE_CODE_SESSION_PROVIDER = 'claude-code-session';

export interface PoolBridgeOptions {
  readonly model: string;
  readonly temperature: number;
}

/** JSON shape documentation embedded in the pending request so the
 *  fill pass can self-validate. Mirrors the response contracts the
 *  prompt builders already state in their prompt text. */
const SELECT_RESPONSE_SCHEMA =
  '{ "matched": boolean, "screen": string|null, "element": string|null, "score": number, "rationale": string }';
const INTERPRET_RESPONSE_SCHEMA =
  '{ "interpreted": boolean, "action": string|null, "screen": string|null, "element": string|null, "posture": string|null, "confidence": number, "rationale": string, "suggestedAliases": string[] }';

function renderPromptText(op: ReasoningOp, request: ReasoningRequestByOp[ReasoningOp]): string {
  switch (op) {
    case 'select': {
      const req = request as SelectRequest;
      return `${buildTranslationSystemPrompt(req)}\n\n${buildTranslationUserMessage(req)}`;
    }
    case 'interpret': {
      const req = request as InterpretRequest;
      return `${buildAgentSystemPrompt(req)}\n\n${buildAgentUserMessage(req)}`;
    }
    case 'synthesize': {
      const req = request as SynthesisRequest;
      return req.prompt;
    }
  }
}

/** Render an op request into the pool's pending envelope. The
 *  fingerprint covers (op, promptText, model, temperature,
 *  closedParams) per I-Fingerprint; `requestedAt` is provenance
 *  only and deliberately outside the key. */
export function buildPendingRequest<Op extends ReasoningOp>(
  op: Op,
  request: ReasoningRequestByOp[Op],
  options: PoolBridgeOptions,
  requestedAt: string,
): PendingRequest {
  const promptText = renderPromptText(op, request);
  const closedParams: Record<string, string> =
    op === 'synthesize'
      ? {
          purpose: (request as SynthesisRequest).purpose,
          ...((request as SynthesisRequest).maxTokens !== undefined
            ? { maxTokens: String((request as SynthesisRequest).maxTokens) }
            : {}),
        }
      : {};
  const fp = promptFingerprint(op, promptText, options.model, options.temperature, closedParams);

  return {
    promptFingerprint: fp,
    op,
    requestedAt,
    model: options.model,
    temperature: options.temperature,
    promptText,
    closedParams,
    callsite:
      op === 'select'
        ? { module: 'reasoning/select', purpose: 'rung-5 structured match' }
        : op === 'interpret'
          ? { module: 'reasoning/interpret', purpose: 'rung-9 semantic judgment' }
          : { module: 'reasoning/synthesize', purpose: (request as SynthesisRequest).purpose },
    expectedResponseShape:
      op === 'select'
        ? { kind: 'json-schema', schema: SELECT_RESPONSE_SCHEMA }
        : op === 'interpret'
          ? { kind: 'json-schema', schema: INTERPRET_RESPONSE_SCHEMA }
          : { kind: 'plain-text' },
  };
}

/** Failure-shaped payload per op, used when the pool cannot supply
 *  a fill (needs-fill, malformed fill, pool IO failure). The port's
 *  error channel is `never` (I-PortShape) — like every existing
 *  adapter, pool adapters surface failure through the payload, and
 *  the pipeline's normal no-match path routes the step to
 *  needs-human. `failureClass: 'cache-miss'` on select keeps the
 *  receipt log queryable for unfilled prompts. */
export function failurePayload<Op extends ReasoningOp>(
  op: Op,
  rationale: string,
  cacheKey: string,
): ReasoningPayloadByOp[Op] {
  switch (op) {
    case 'select':
      return {
        kind: 'translation-receipt',
        version: 1,
        mode: 'structured-translation',
        matched: false,
        selected: null,
        candidates: [],
        rationale,
        translationProvider: CLAUDE_CODE_SESSION_PROVIDER,
        cache: { key: cacheKey, status: 'miss', reason: rationale },
        failureClass: 'cache-miss',
      } as unknown as ReasoningPayloadByOp[Op];
    case 'interpret':
      return {
        interpreted: false,
        target: null,
        confidence: 0,
        rationale,
        proposalDrafts: [],
        provider: CLAUDE_CODE_SESSION_PROVIDER,
      } as unknown as ReasoningPayloadByOp[Op];
    case 'synthesize':
      return { text: '', stopReason: 'error' } as ReasoningPayloadByOp[Op];
  }
}

/** Interpret a filled response into the op's payload. Reuses the
 *  live backends' parsers; their `ReasoningMalformedResponseError`
 *  throws reconcile into `FilledSchemaMismatch` so the adapter can
 *  route the bad fill to `rejected/`. */
export function parseFillIntoPayload<Op extends ReasoningOp>(
  op: Op,
  request: ReasoningRequestByOp[Op],
  filled: FilledResponse,
): Either.Either<ReasoningPayloadByOp[Op], PoolError> {
  try {
    switch (op) {
      case 'select': {
        const payload = parseLlmResponse(filled.response.text, request as SelectRequest);
        return Either.right({
          ...payload,
          translationProvider: CLAUDE_CODE_SESSION_PROVIDER,
        } as ReasoningPayloadByOp[Op]);
      }
      case 'interpret': {
        const payload = parseAgentResponse(
          filled.response.text,
          request as InterpretRequest,
          CLAUDE_CODE_SESSION_PROVIDER,
        );
        return Either.right(payload as ReasoningPayloadByOp[Op]);
      }
      case 'synthesize': {
        return Either.right({
          text: filled.response.text,
          stopReason: 'end-of-output',
        } as ReasoningPayloadByOp[Op]);
      }
    }
  } catch (cause) {
    const reason = cause instanceof ReasoningError ? cause.message : String(cause);
    return Either.left(
      filledSchemaMismatch(filled.promptFingerprint, `${op}: ${reason}`),
    );
  }
}
