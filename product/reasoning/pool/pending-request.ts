/**
 * PendingRequest — the envelope a `RecordReasoning` adapter writes
 * under `.tesseract/reasoning-pool/pending/<fp>.json` (Z11d).
 *
 * Per `docs/v2-live-adapter-plan.md §4.1`. The envelope carries
 * everything a fill pass needs to author a response without
 * consulting the recording run's in-memory state: the full prompt
 * text, the closed parameter bag that participated in the
 * fingerprint, a human-legible callsite label, and the response
 * shape the fill must respect.
 *
 * Pure domain. No Effect. `parsePendingRequest` validates persisted
 * JSON back into the envelope; round-trip is a law (ZD1.e).
 */

import { Either } from 'effect';
import type { ReasoningOp } from '../reasoning';
import { REASONING_OP_VALUES } from '../reasoning';
import { filledMalformed, type PoolError } from './errors';

// ─── Expected response shape ─────────────────────────────────

/** The shape contract a fill must respect. Closed union:
 *   - `plain-text`  — free-form prose.
 *   - `json-schema` — `schema` carries a JSON-schema string the
 *     response text must parse + validate against.
 *   - `enum-token`  — the response text must be exactly one of
 *     `enumValues`. */
export interface ExpectedResponseShape {
  readonly kind: 'plain-text' | 'json-schema' | 'enum-token';
  readonly schema?: string | undefined;
  readonly enumValues?: readonly string[] | undefined;
}

export type ExpectedResponseShapeKind = ExpectedResponseShape['kind'];

export function foldExpectedResponseShape<R>(
  shape: ExpectedResponseShape,
  cases: {
    readonly plainText: () => R;
    readonly jsonSchema: (schema: string | undefined) => R;
    readonly enumToken: (enumValues: readonly string[]) => R;
  },
): R {
  switch (shape.kind) {
    case 'plain-text':
      return cases.plainText();
    case 'json-schema':
      return cases.jsonSchema(shape.schema);
    case 'enum-token':
      return cases.enumToken(shape.enumValues ?? []);
  }
}

// ─── PendingRequest envelope ─────────────────────────────────

export interface PendingRequestCallsite {
  readonly module: string;
  readonly purpose: string;
}

export interface PendingRequest {
  /** Content-addressed key — see `promptFingerprint` in
   *  `./fingerprint.ts`. Also the file's basename. */
  readonly promptFingerprint: string;
  readonly op: ReasoningOp;
  /** ISO-8601. Provenance only; deliberately OUTSIDE the
   *  fingerprint so re-recording the same prompt is idempotent. */
  readonly requestedAt: string;
  readonly model: string;
  readonly temperature: number;
  /** The full prompt the fill pass responds to. */
  readonly promptText: string;
  /** Stable parameter bag participating in the fingerprint. */
  readonly closedParams: Readonly<Record<string, string>>;
  readonly callsite: PendingRequestCallsite;
  readonly expectedResponseShape: ExpectedResponseShape;
}

// ─── Codec ───────────────────────────────────────────────────

const RESPONSE_SHAPE_KINDS: ReadonlySet<string> = new Set(['plain-text', 'json-schema', 'enum-token']);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((entry) => typeof entry === 'string');

/** Validate persisted JSON back into a `PendingRequest`. Failures
 *  carry the field that broke, via the `FilledMalformed` variant's
 *  reason channel (the pool reuses one malformed-shape error for
 *  both envelope kinds; the fingerprint argument disambiguates). */
export function parsePendingRequest(value: unknown): Either.Either<PendingRequest, PoolError> {
  const fail = (fp: string, reason: string): Either.Either<PendingRequest, PoolError> =>
    Either.left(filledMalformed(fp, `pending-request: ${reason}`));

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('', 'not an object');
  }
  const record = value as Record<string, unknown>;
  const fp = typeof record.promptFingerprint === 'string' ? record.promptFingerprint : '';
  if (fp === '') return fail('', 'promptFingerprint missing or not a string');
  if (typeof record.op !== 'string' || !(REASONING_OP_VALUES as readonly string[]).includes(record.op)) {
    return fail(fp, `op must be one of ${REASONING_OP_VALUES.join('|')}`);
  }
  if (typeof record.requestedAt !== 'string') return fail(fp, 'requestedAt must be a string');
  if (typeof record.model !== 'string') return fail(fp, 'model must be a string');
  if (typeof record.temperature !== 'number' || Number.isNaN(record.temperature)) {
    return fail(fp, 'temperature must be a number');
  }
  if (typeof record.promptText !== 'string') return fail(fp, 'promptText must be a string');
  if (!isStringRecord(record.closedParams)) return fail(fp, 'closedParams must be a string record');
  const callsite = record.callsite as Record<string, unknown> | undefined;
  if (
    typeof callsite !== 'object' || callsite === null ||
    typeof callsite.module !== 'string' || typeof callsite.purpose !== 'string'
  ) {
    return fail(fp, 'callsite must carry module + purpose strings');
  }
  const shape = record.expectedResponseShape as Record<string, unknown> | undefined;
  if (typeof shape !== 'object' || shape === null || typeof shape.kind !== 'string' || !RESPONSE_SHAPE_KINDS.has(shape.kind)) {
    return fail(fp, 'expectedResponseShape.kind must be plain-text|json-schema|enum-token');
  }
  if (shape.schema !== undefined && typeof shape.schema !== 'string') {
    return fail(fp, 'expectedResponseShape.schema must be a string when present');
  }
  if (shape.enumValues !== undefined && !(Array.isArray(shape.enumValues) && shape.enumValues.every((v) => typeof v === 'string'))) {
    return fail(fp, 'expectedResponseShape.enumValues must be a string array when present');
  }

  return Either.right({
    promptFingerprint: fp,
    op: record.op as ReasoningOp,
    requestedAt: record.requestedAt,
    model: record.model,
    temperature: record.temperature,
    promptText: record.promptText,
    closedParams: { ...(record.closedParams as Record<string, string>) },
    callsite: { module: callsite.module, purpose: callsite.purpose },
    expectedResponseShape: {
      kind: shape.kind as ExpectedResponseShape['kind'],
      ...(shape.schema !== undefined ? { schema: shape.schema as string } : {}),
      ...(shape.enumValues !== undefined ? { enumValues: [...(shape.enumValues as string[])] } : {}),
    },
  });
}
