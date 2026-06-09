/**
 * PoolError — the reasoning-pool's closed error union (Z11d).
 *
 * Per `docs/v2-live-adapter-plan.md §4.2`. Four variants cover the
 * pool's failure surface:
 *
 *   - `NeedsFill` — no filled response exists for the fingerprint;
 *     a pending request was (or already had been) recorded.
 *   - `FilledMalformed` — a filled file exists but does not parse
 *     as a `FilledResponse` envelope.
 *   - `FilledSchemaMismatch` — a filled response parses but violates
 *     the pending request's `expectedResponseShape`.
 *   - `PoolIoFailed` — the filesystem surface itself failed.
 *
 * Pure domain. No Effect. `foldPoolError` is the exhaustive
 * dispatcher; widening the union without updating the fold is a
 * compile error.
 */

export type PoolError =
  | { readonly _tag: 'NeedsFill'; readonly promptFingerprint: string; readonly pendingPath: string }
  | { readonly _tag: 'FilledMalformed'; readonly promptFingerprint: string; readonly reason: string }
  | { readonly _tag: 'FilledSchemaMismatch'; readonly promptFingerprint: string; readonly expected: string }
  | { readonly _tag: 'PoolIoFailed'; readonly path: string; readonly cause: string };

export interface PoolErrorCases<R> {
  readonly needsFill: (e: Extract<PoolError, { _tag: 'NeedsFill' }>) => R;
  readonly filledMalformed: (e: Extract<PoolError, { _tag: 'FilledMalformed' }>) => R;
  readonly filledSchemaMismatch: (e: Extract<PoolError, { _tag: 'FilledSchemaMismatch' }>) => R;
  readonly poolIoFailed: (e: Extract<PoolError, { _tag: 'PoolIoFailed' }>) => R;
}

export function foldPoolError<R>(err: PoolError, cases: PoolErrorCases<R>): R {
  switch (err._tag) {
    case 'NeedsFill':
      return cases.needsFill(err);
    case 'FilledMalformed':
      return cases.filledMalformed(err);
    case 'FilledSchemaMismatch':
      return cases.filledSchemaMismatch(err);
    case 'PoolIoFailed':
      return cases.poolIoFailed(err);
  }
}

export const needsFill = (promptFingerprint: string, pendingPath: string): PoolError =>
  ({ _tag: 'NeedsFill', promptFingerprint, pendingPath });

export const filledMalformed = (promptFingerprint: string, reason: string): PoolError =>
  ({ _tag: 'FilledMalformed', promptFingerprint, reason });

export const filledSchemaMismatch = (promptFingerprint: string, expected: string): PoolError =>
  ({ _tag: 'FilledSchemaMismatch', promptFingerprint, expected });

export const poolIoFailed = (path: string, cause: string): PoolError =>
  ({ _tag: 'PoolIoFailed', path, cause });
