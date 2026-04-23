/**
 * CompoundingError — tagged union of errors the engine's services
 * can produce.
 *
 * Per docs/v2-compounding-engine-plan.md §4.4, the two injectable
 * services (HypothesisLedger + ReceiptStore) classify their
 * failures into this closed union. Effect.catchTag dispatches at
 * application-layer boundaries; `foldCompoundingError` at domain.
 *
 * The domain stays Effect-free — these are pure tagged records.
 * The application layer wraps them in Effect failure types when it
 * needs them under `Effect.Effect<A, CompoundingError, R>`.
 *
 * Four variants:
 *   - `LogIoFailed`                   — filesystem I/O failed.
 *   - `HypothesisFingerprintMismatch` — a receipt references a
 *                                        hypothesis by id whose
 *                                        fingerprint no longer
 *                                        matches the ledger entry
 *                                        (indicates log tampering).
 *   - `EvidenceQueryFailed`           — cohort-scoped receipt
 *                                        query failed.
 *   - `SupersedesChainCircular`       — authoring a hypothesis
 *                                        would form a cycle in the
 *                                        supersedes chain.
 *
 * No Effect imports.
 */

export interface LogIoFailed {
  readonly _tag: 'LogIoFailed';
  readonly path: string;
  readonly cause: string;
}

export interface HypothesisFingerprintMismatch {
  readonly _tag: 'HypothesisFingerprintMismatch';
  readonly expected: string;
  readonly actual: string;
}

export interface EvidenceQueryFailed {
  readonly _tag: 'EvidenceQueryFailed';
  readonly cohortKey: string;
  readonly cause: string;
}

export interface SupersedesChainCircular {
  readonly _tag: 'SupersedesChainCircular';
  readonly chain: readonly string[];
}

/** The closed CompoundingError union. */
export type CompoundingError =
  | LogIoFailed
  | HypothesisFingerprintMismatch
  | EvidenceQueryFailed
  | SupersedesChainCircular;

export function logIoFailed(path: string, cause: string): LogIoFailed {
  return { _tag: 'LogIoFailed', path, cause };
}

export function hypothesisFingerprintMismatch(
  expected: string,
  actual: string,
): HypothesisFingerprintMismatch {
  return { _tag: 'HypothesisFingerprintMismatch', expected, actual };
}

export function evidenceQueryFailed(
  cohortKey: string,
  cause: string,
): EvidenceQueryFailed {
  return { _tag: 'EvidenceQueryFailed', cohortKey, cause };
}

export function supersedesChainCircular(chain: readonly string[]): SupersedesChainCircular {
  return { _tag: 'SupersedesChainCircular', chain };
}

/** Exhaustive CompoundingError fold. Adding a variant is a
 *  typecheck error until every call site adds the case. */
export function foldCompoundingError<R>(
  err: CompoundingError,
  cases: {
    readonly logIo: (e: LogIoFailed) => R;
    readonly fingerprintMismatch: (e: HypothesisFingerprintMismatch) => R;
    readonly evidenceQuery: (e: EvidenceQueryFailed) => R;
    readonly supersedesCircular: (e: SupersedesChainCircular) => R;
  },
): R {
  switch (err._tag) {
    case 'LogIoFailed':                   return cases.logIo(err);
    case 'HypothesisFingerprintMismatch': return cases.fingerprintMismatch(err);
    case 'EvidenceQueryFailed':           return cases.evidenceQuery(err);
    case 'SupersedesChainCircular':       return cases.supersedesCircular(err);
  }
}
