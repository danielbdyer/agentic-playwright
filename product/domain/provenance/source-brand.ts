/**
 * Resolution source branding — phantom types for provenance tracking.
 *
 * Extracted from governance/workflow-types.ts during Phase 2 domain decomposition.
 */

declare const ResolutionSourceBrand: unique symbol;

/**
 * Phantom brand for resolution candidates, tagged by the precedence rung
 * that produced them. Makes it a compile-time error to mix candidates from
 * different resolution sources without explicit coercion.
 */
export type SourcedCandidate<T, Rung extends string> = T & { readonly [ResolutionSourceBrand]: Rung };

export function brandBySource<T, Rung extends string>(candidate: T, _rung: Rung): SourcedCandidate<T, Rung> {
  return candidate as SourcedCandidate<T, Rung>;
}

export function foldSourcedCandidate<T, Rung extends string, R>(
  candidate: SourcedCandidate<T, Rung>,
  rung: Rung,
  cases: { match: (c: SourcedCandidate<T, Rung>) => R; mismatch: (c: T) => R },
): R {
  return (candidate as unknown as { [ResolutionSourceBrand]: string })[ResolutionSourceBrand] === rung
    ? cases.match(candidate)
    : cases.mismatch(candidate);
}
