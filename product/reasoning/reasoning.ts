/**
 * The Reasoning Port (v2 §3.6 + readiness §9)
 *
 * One unified Effect-shaped contract for every operation that consults
 * a reasoning agent — whether the agent is a Copilot extension, an Azure
 * AI Foundry chat completion, an offline heuristic, or a deterministic
 * fallback. v1 had two proto-Reasoning ports (`TranslationProvider` at
 * rung 5 and `AgentInterpreterPort` at rung 9) that already followed
 * the same shape — strategy interface + Effect monad + callback DI +
 * deterministic fallback + composite hybrid. v2 collapses them.
 *
 * Three operations:
 *   - `select`     — structured match against a candidate set
 *                    (TranslationProvider's role)
 *   - `interpret`  — semantic judgment with full DOM/exhaustion context
 *                    (AgentInterpreterPort's role)
 *   - `synthesize` — open-ended generation for forward extensions
 *                    (no production caller yet — adapters land as
 *                    no-ops; the port shape is fixed now so future
 *                    adapter authors don't churn the interface)
 *
 * Provider choice is a `Layer.succeed(Reasoning.Tag, <adapter>)`
 * composition decision per readiness §9.6. Saga code stays
 * provider-agnostic. Adapter selection priority:
 *   1. VSCode GitHub Copilot (interactive sessions, primary)
 *   2. Azure AI Foundry → OpenAI o3/4o (programmatic, secondary)
 *   3. Direct Anthropic / MCP-brokered / local-model (lower priority,
 *      port shape stays open for them).
 *
 * Every adapter populates a `ReasoningReceipt<Op>` carrying token
 * counts, latency, and the prompt fingerprint. The receipt log joins
 * `product/`'s append-only log set; workshop reads it to derive
 * cost / batting-average / token-consumption metrics.
 *
 * Status: 4b.B.1 — port declaration + types only. No runtime callers
 * yet; the existing `TranslationProvider` and `AgentInterpreterPort`
 * stay as-is until 4b.B.4 migrates callsites.
 */

import { Context, type Effect } from 'effect';
import type { TranslationReceipt, TranslationRequest } from '../domain/resolution/types';
import type { AgentInterpretationRequest, AgentInterpretationResult } from '../domain/interpretation/agent-interpreter';

// ─── Operation discriminator ───

/** The three operations the unified port supports. The discriminator
 *  threads through `ReasoningReceipt<Op>` so the receipt log is
 *  queryable by operation kind without inspecting payload shape. */
export type ReasoningOp = 'select' | 'interpret' | 'synthesize';

// ─── Per-operation request and response types ───

/**
 * `select` — structured match. Inherits TranslationProvider's request
 * shape (a step text + candidate screens + allowed actions). The
 * response is the existing `TranslationReceipt` payload, lifted into
 * the unified receipt envelope at the port boundary.
 */
export type SelectRequest = TranslationRequest;
export type SelectPayload = TranslationReceipt;

/**
 * `interpret` — semantic judgment. Inherits AgentInterpreterPort's
 * request shape (full DOM + exhaustion trail + candidate screens).
 * The payload retains the v1 result type until callsite migrations
 * lift consumers off it.
 */
export type InterpretRequest = AgentInterpretationRequest;
export type InterpretPayload = AgentInterpretationResult;

/**
 * `synthesize` — open-ended generation. Reserved for forward
 * extensions (e.g. proposal-draft authoring, runbook synthesis).
 * Initial shape kept minimal so the first real caller can refine
 * without breaking the port.
 */
export interface SynthesisRequest {
  readonly prompt: string;
  readonly maxTokens?: number | undefined;
  readonly purpose: string;
}
export interface SynthesisPayload {
  readonly text: string;
  readonly stopReason: 'end-of-output' | 'max-tokens' | 'error';
}

// ─── Per-op type maps for the generic receipt ───

/**
 * Mapped type connecting the operation discriminator to its payload.
 * Adding a new operation means extending `ReasoningOp` AND adding a
 * member here — TypeScript enforces the pairing.
 */
export interface ReasoningPayloadByOp {
  readonly select: SelectPayload;
  readonly interpret: InterpretPayload;
  readonly synthesize: SynthesisPayload;
}

export interface ReasoningRequestByOp {
  readonly select: SelectRequest;
  readonly interpret: InterpretRequest;
  readonly synthesize: SynthesisRequest;
}

// ─── Token accounting ───

/**
 * Token counts populated by every adapter that issues a model call.
 * Adapters that don't issue calls (deterministic, disabled, stub)
 * report all-zero. The workshop's `metric-reasoning-token-consumption-p50`
 * derivation stratifies by adapter id and operation; populating these
 * fields here makes that stratification possible without parsing
 * provider-specific telemetry shapes.
 */
export interface ReasoningTokens {
  readonly prompt: number;
  readonly completion: number;
  readonly total: number;
}

export const ZERO_TOKENS: ReasoningTokens = {
  prompt: 0,
  completion: 0,
  total: 0,
};

// ─── ReasoningReceipt<Op> ───

/**
 * The unified receipt produced by every reasoning call.
 *
 * `op` selects the payload shape via `ReasoningPayloadByOp`.
 * Adapters MUST populate every field — `tokens` zeroed for non-LLM
 * adapters, `promptFingerprint` zeroed via empty hash when no prompt
 * was rendered (e.g. deterministic fallback).
 *
 * `provider` is the adapter id ('deterministic-token-overlap',
 * 'llm-api-gpt-4o', 'copilot-vscode', etc.). Stratification key for
 * workshop metrics.
 *
 * `model` is the model identifier the adapter actually invoked. For
 * 'copilot-vscode' it's the Copilot model name surfaced via
 * `vscode.lm.selectChatModels()`; for 'llm-api-*' it's the OpenAI
 * model id; for deterministic, the empty string.
 *
 * `latencyMs` is wall-clock from request submission to receipt
 * production. Includes retry waits.
 *
 * `promptFingerprint` is `sha256(stableStringify(promptStructure))`
 * per readiness §9.6. Lets the receipt log be queried by prompt
 * shape — useful for prompt-optimization experiments and for
 * stratifying batting average by prompt version.
 */
export interface ReasoningReceipt<Op extends ReasoningOp> {
  readonly op: Op;
  readonly provider: string;
  readonly model: string;
  readonly tokens: ReasoningTokens;
  readonly latencyMs: number;
  readonly promptFingerprint: string;
  readonly payload: ReasoningPayloadByOp[Op];
}

// ─── Reasoning interface ───

/**
 * The unified port. One implementation handles all three operations.
 * Adapters compose the operations differently (a Copilot adapter may
 * route all three through the same chat session; a deterministic
 * adapter may no-op on `interpret` and `synthesize`).
 *
 * Note: error channel typed as `never` for parity with v1's
 * Translation/Agent providers, both of which catch all errors
 * internally and return failure-shaped receipts. 4b.B.2 introduces
 * the `ReasoningError` typed error union and adapters that prefer
 * to surface errors at the Effect channel can do so on a per-op
 * basis.
 */
// ─── Reasoning service contract + DI tag ───

/** The interface every Reasoning adapter implements. Distinct from
 *  the `Reasoning` Tag so adapters can `satisfies ReasoningService`
 *  without conflating the service shape with the Tag's Id/Type/
 *  TagTypeId members. `yield* Reasoning` returns a ReasoningService
 *  per the Tag's second type argument.
 *
 *  Note: error channel typed as `never` for parity with v1's
 *  Translation/Agent providers, both of which catch all errors
 *  internally and return failure-shaped receipts. 4b.B.2 introduced
 *  the `ReasoningError` typed error union; adapters that prefer to
 *  surface typed errors on the Effect channel can do so per-op by
 *  lifting their signatures locally. */
export interface ReasoningService {
  readonly select: (request: SelectRequest) => Effect.Effect<ReasoningReceipt<'select'>, never, never>;
  readonly interpret: (request: InterpretRequest) => Effect.Effect<ReasoningReceipt<'interpret'>, never, never>;
  readonly synthesize: (request: SynthesisRequest) => Effect.Effect<ReasoningReceipt<'synthesize'>, never, never>;
}

/**
 * Effect Context tag for the Reasoning port. Compose via:
 *
 * ```ts
 * Layer.succeed(Reasoning, copilotReasoningAdapter())
 * ```
 *
 * Saga code consumes via:
 *
 * ```ts
 * const reasoning = yield* Reasoning;
 * const receipt = yield* reasoning.select(request);
 * ```
 *
 * Adapter selection at composition lives in
 * `product/composition/local-services.ts` (4b.B.4).
 */
export class Reasoning extends Context.Tag('product/reasoning/Reasoning')<Reasoning, ReasoningService>() {}

// ─── Helpers ───

/**
 * Build a receipt envelope from a raw payload + telemetry. Adapters
 * call this at the end of every operation so receipt construction is
 * consistent across implementations.
 */
export function buildReceipt<Op extends ReasoningOp>(input: {
  readonly op: Op;
  readonly provider: string;
  readonly model: string;
  readonly tokens?: ReasoningTokens | undefined;
  readonly latencyMs: number;
  readonly promptFingerprint: string;
  readonly payload: ReasoningPayloadByOp[Op];
}): ReasoningReceipt<Op> {
  return {
    op: input.op,
    provider: input.provider,
    model: input.model,
    tokens: input.tokens ?? ZERO_TOKENS,
    latencyMs: input.latencyMs,
    promptFingerprint: input.promptFingerprint,
    payload: input.payload,
  };
}
