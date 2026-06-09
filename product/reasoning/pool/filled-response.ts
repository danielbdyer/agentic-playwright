/**
 * FilledResponse — the envelope a fill pass writes under
 * `.tesseract/reasoning-pool/filled/<fp>.json` (Z11d).
 *
 * Per `docs/v2-live-adapter-plan.md §4.1`. Authored by the Claude
 * Code session (or an operator) in response to a `PendingRequest`;
 * consumed by `ReplayReasoning` to synthesize a real
 * `ReasoningReceipt` with `provider: 'claude-code-session'`.
 *
 * Append-only discipline (I-Append): a correction lands as a new
 * file carrying `supersedes`; the original is never overwritten.
 *
 * Pure domain. No Effect. Round-trip is a law (ZD1.f).
 */

import { Either } from 'effect';
import { filledMalformed, type PoolError } from './errors';

export interface FilledTokenEstimate {
  readonly prompt: number;
  readonly response: number;
  readonly source: 'estimated' | 'measured' | 'unknown';
}

export interface FilledResponse {
  /** Must equal the pending request's fingerprint (and the file's
   *  basename). The join key between the two envelopes. */
  readonly promptFingerprint: string;
  /** ISO-8601 at fill time. */
  readonly filledAt: string;
  /** Claude Code session id when available; empty string otherwise. */
  readonly authorSessionId: string;
  readonly response: {
    readonly text: string;
    /** Present when the fill pass already schema-validated the text. */
    readonly parsed?: unknown;
  };
  /** One line; operators scan it for fill quality. */
  readonly reasoningSummary: string;
  readonly estimatedTokens: FilledTokenEstimate;
  /** Prior fingerprint when this fill corrects an earlier one. */
  readonly supersedes?: string | null | undefined;
}

const TOKEN_SOURCES: ReadonlySet<string> = new Set(['estimated', 'measured', 'unknown']);

/** Validate persisted JSON back into a `FilledResponse`. */
export function parseFilledResponse(value: unknown): Either.Either<FilledResponse, PoolError> {
  const fail = (fp: string, reason: string): Either.Either<FilledResponse, PoolError> =>
    Either.left(filledMalformed(fp, `filled-response: ${reason}`));

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('', 'not an object');
  }
  const record = value as Record<string, unknown>;
  const fp = typeof record.promptFingerprint === 'string' ? record.promptFingerprint : '';
  if (fp === '') return fail('', 'promptFingerprint missing or not a string');
  if (typeof record.filledAt !== 'string') return fail(fp, 'filledAt must be a string');
  if (typeof record.authorSessionId !== 'string') return fail(fp, 'authorSessionId must be a string');
  const response = record.response as Record<string, unknown> | undefined;
  if (typeof response !== 'object' || response === null || typeof response.text !== 'string') {
    return fail(fp, 'response.text must be a string');
  }
  if (typeof record.reasoningSummary !== 'string') return fail(fp, 'reasoningSummary must be a string');
  const tokens = record.estimatedTokens as Record<string, unknown> | undefined;
  if (
    typeof tokens !== 'object' || tokens === null ||
    typeof tokens.prompt !== 'number' || typeof tokens.response !== 'number' ||
    typeof tokens.source !== 'string' || !TOKEN_SOURCES.has(tokens.source)
  ) {
    return fail(fp, 'estimatedTokens must carry prompt + response numbers and a source of estimated|measured|unknown');
  }
  if (record.supersedes !== undefined && record.supersedes !== null && typeof record.supersedes !== 'string') {
    return fail(fp, 'supersedes must be a string or null when present');
  }

  return Either.right({
    promptFingerprint: fp,
    filledAt: record.filledAt,
    authorSessionId: record.authorSessionId,
    response: {
      text: response.text,
      ...(Object.prototype.hasOwnProperty.call(response, 'parsed') ? { parsed: response.parsed } : {}),
    },
    reasoningSummary: record.reasoningSummary,
    estimatedTokens: {
      prompt: tokens.prompt,
      response: tokens.response,
      source: tokens.source as FilledTokenEstimate['source'],
    },
    ...(record.supersedes !== undefined ? { supersedes: record.supersedes as string | null } : {}),
  });
}

/** Char-count ÷ 4 token estimate per plan §6.5. Accuracy to within
 *  2x is acceptable; the `source: 'estimated'` stamp warns
 *  downstream consumers. */
export function estimateTokens(promptText: string, responseText: string): FilledTokenEstimate {
  return {
    prompt: Math.ceil(promptText.length / 4),
    response: Math.ceil(responseText.length / 4),
    source: 'estimated',
  };
}
