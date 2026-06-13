/**
 * Reasoning pool — file-mediated record/fill/replay domain (Z11d).
 *
 * The praxis audit's deferred gap G10 named reasoning metering as a
 * Z11d landing requirement; this module is Z11d's pure core. It
 * realizes "Claude-as-adapter" (docs/v2-live-adapter-plan.md §1.1):
 * a reasoning call RECORDS a pending request to disk; a fill pass
 * (a Claude session) authors a response; a later run REPLAYS the
 * filled response into a real `ReasoningReceipt`. No live LLM API
 * wired; the agent IS the adapter, file-mediated.
 *
 * This module is pure (types + fingerprint + pure read/serialize
 * helpers); the filesystem adapters live product-side
 * (`product/reasoning/adapters/`) and the cohort's reasoning rung
 * (workshop) shares these types — the on-disk JSON shape is the
 * cross-seam contract, like the cohort receipt + compilation
 * receipt formats. Hence this lives in the shared-contract set
 * (`product/domain/reasoning-pool` in ALWAYS_ALLOWED_PRODUCT_PATHS).
 *
 * The fingerprint is the reproducibility contract: identical
 * `(op, model, prompt, purpose)` → identical fingerprint → the same
 * pool filename → a deterministic cache hit on replay.
 *
 * Pure — no Effect, no fs.
 */

import { taggedFingerprintFor, type Fingerprint } from '../kernel/hash';
import { TesseractError } from '../kernel/errors';

/** A reasoning request parked on disk awaiting a fill. */
export interface PendingRequest {
  readonly fingerprint: Fingerprint<'reasoning-prompt'>;
  /** Which reasoning op this request is for. The cohort bridge uses
   *  `synthesize` (open-ended candidate selection); the product
   *  pipeline can record `select` / `interpret` the same way. */
  readonly op: 'select' | 'interpret' | 'synthesize';
  readonly model: string;
  readonly prompt: string;
  readonly purpose: string;
  /** Optional structured context the filler needs to answer well —
   *  e.g. the cohort's candidate menu + failure-shape note. */
  readonly context: unknown;
  readonly createdAt: string;
}

/** A filled response a fill pass authored for a pending request. */
export interface FilledResponse {
  readonly fingerprint: Fingerprint<'reasoning-prompt'>;
  readonly op: 'select' | 'interpret' | 'synthesize';
  /** The answer text. For the cohort bridge: the chosen accessible
   *  name, or the sentinel `NONE` when no candidate is the target
   *  (the honest "this needs more than reasoning over this menu"). */
  readonly text: string;
  readonly model: string;
  readonly filledBy: string;
  readonly filledAt: string;
  /** Optional token accounting, for cost metering (G10). */
  readonly tokens?: { readonly prompt: number; readonly completion: number; readonly total: number } | undefined;
}

/** Sentinel a fill uses to say "no candidate in this menu is the
 *  target" — a refusal that is itself a valid, metered answer. */
export const POOL_NONE = 'NONE' as const;

export type PoolErrorKind = 'not-filled' | 'malformed-fill' | 'io-failed';

export class PoolError extends TesseractError {
  override readonly _tag = 'PoolError' as const;
  readonly kind: PoolErrorKind;
  constructor(kind: PoolErrorKind, message: string, cause?: unknown) {
    super(`reasoning-pool-${kind}`, message, cause);
    this.name = 'PoolError';
    this.kind = kind;
  }
}

export function foldPoolError<R>(
  error: PoolError,
  cases: {
    readonly notFilled: (e: PoolError) => R;
    readonly malformedFill: (e: PoolError) => R;
    readonly ioFailed: (e: PoolError) => R;
  },
): R {
  switch (error.kind) {
    case 'not-filled': return cases.notFilled(error);
    case 'malformed-fill': return cases.malformedFill(error);
    case 'io-failed': return cases.ioFailed(error);
  }
}

/**
 * Deterministic fingerprint of a reasoning request's semantic
 * content. Param order does not matter (the hash sorts keys);
 * model variation DOES matter (a different model is a different
 * answer). This is the pool filename and the reproducibility key.
 */
export function reasoningPromptFingerprint(input: {
  readonly op: 'select' | 'interpret' | 'synthesize';
  readonly model: string;
  readonly prompt: string;
  readonly purpose: string;
}): Fingerprint<'reasoning-prompt'> {
  return taggedFingerprintFor('reasoning-prompt', {
    op: input.op,
    model: input.model,
    prompt: input.prompt,
    purpose: input.purpose,
  });
}

/** Build a PendingRequest (pure; the fs write is the adapter's job). */
export function buildPendingRequest(input: {
  readonly op: 'select' | 'interpret' | 'synthesize';
  readonly model: string;
  readonly prompt: string;
  readonly purpose: string;
  readonly context: unknown;
  readonly createdAt: string;
}): PendingRequest {
  return {
    fingerprint: reasoningPromptFingerprint(input),
    op: input.op,
    model: input.model,
    prompt: input.prompt,
    purpose: input.purpose,
    context: input.context,
    createdAt: input.createdAt,
  };
}

/** Parse + validate a filled response read from disk. Returns the
 *  response or a PoolError('malformed-fill'). Pure. */
export function parseFilledResponse(raw: unknown): FilledResponse | PoolError {
  if (typeof raw !== 'object' || raw === null) {
    return new PoolError('malformed-fill', 'filled response is not an object');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.fingerprint !== 'string' || typeof r.text !== 'string' || typeof r.op !== 'string') {
    return new PoolError('malformed-fill', 'filled response missing fingerprint/text/op');
  }
  if (r.op !== 'select' && r.op !== 'interpret' && r.op !== 'synthesize') {
    return new PoolError('malformed-fill', `filled response has invalid op '${String(r.op)}'`);
  }
  return {
    fingerprint: r.fingerprint as Fingerprint<'reasoning-prompt'>,
    op: r.op,
    text: r.text,
    model: typeof r.model === 'string' ? r.model : 'claude-code-session',
    filledBy: typeof r.filledBy === 'string' ? r.filledBy : 'unknown',
    filledAt: typeof r.filledAt === 'string' ? r.filledAt : new Date(0).toISOString(),
    tokens:
      typeof r.tokens === 'object' && r.tokens !== null
        ? (r.tokens as FilledResponse['tokens'])
        : undefined,
  };
}
