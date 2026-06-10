/**
 * Fill validation — the shape gate between a fill pass's authored
 * response and the replay cache (Z11d.d, plan §6.5 + ZD4 laws).
 *
 * A `FilledResponse` is admissible against its `PendingRequest` when:
 *   - the fingerprints agree (join-key integrity);
 *   - `plain-text` fills carry non-empty text;
 *   - `json-schema` fills carry text whose first JSON object parses
 *     (the schema string in the pending envelope is authoring
 *     guidance; deep structural validation happens at replay time by
 *     the op's parser, which is the single source of payload truth);
 *   - `enum-token` fills carry exactly one of the declared values
 *     (after trimming).
 *
 * Pure domain. No Effect. Inadmissible fills route to `rejected/`
 * at the drain boundary.
 */

import { Either } from 'effect';
import type { FilledResponse } from './filled-response';
import { foldExpectedResponseShape, type PendingRequest } from './pending-request';
import { filledMalformed, filledSchemaMismatch, type PoolError } from './errors';

export function validateFillAgainstShape(
  pending: PendingRequest,
  filled: FilledResponse,
): Either.Either<FilledResponse, PoolError> {
  if (filled.promptFingerprint !== pending.promptFingerprint) {
    return Either.left(
      filledMalformed(
        pending.promptFingerprint,
        `fill fingerprint ${filled.promptFingerprint} does not match pending ${pending.promptFingerprint}`,
      ),
    );
  }
  const text = filled.response.text;
  return foldExpectedResponseShape<Either.Either<FilledResponse, PoolError>>(
    pending.expectedResponseShape,
    {
      plainText: () =>
        text.trim().length > 0
          ? Either.right(filled)
          : Either.left(filledSchemaMismatch(pending.promptFingerprint, 'plain-text: non-empty response text')),
      jsonSchema: (schema) => {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return Either.left(
            filledSchemaMismatch(pending.promptFingerprint, `json-schema: ${schema ?? 'a JSON object'}`),
          );
        }
        try {
          const parsed = JSON.parse(jsonMatch[0]) as unknown;
          return typeof parsed === 'object' && parsed !== null
            ? Either.right(filled)
            : Either.left(
                filledSchemaMismatch(pending.promptFingerprint, `json-schema: ${schema ?? 'a JSON object'}`),
              );
        } catch {
          return Either.left(
            filledSchemaMismatch(pending.promptFingerprint, `json-schema: ${schema ?? 'a JSON object'}`),
          );
        }
      },
      enumToken: (enumValues) =>
        enumValues.includes(text.trim())
          ? Either.right(filled)
          : Either.left(
              filledSchemaMismatch(
                pending.promptFingerprint,
                `enum-token: one of [${enumValues.join(', ')}]`,
              ),
            ),
    },
  );
}
