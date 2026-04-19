/**
 * Branded epistemic types — mirrors `Approved<T>`/`Blocked<T>` and
 * `foldGovernance` from `product/domain/governance/workflow-types.ts`,
 * applied to `InterventionEpistemicStatus`.
 *
 * Today's `InterventionEpistemicStatus` is a string union with no
 * type-level discrimination. Nothing prevents a synthetic-derived
 * payload from being constructed with `epistemicStatus: 'observed'`.
 * The addendum's A2 (synthetic governability) and H6 (status
 * preservation) are conventions, not invariants.
 *
 * This module makes them invariants:
 *   - phantom-branded types per epistemic status
 *   - exhaustive `foldEpistemicStatus` analyzer
 *   - audited mint functions: synthetic payloads cannot mint Observed
 *
 * Pattern alignment: Visitor + State Machine, mirroring
 * `product/domain/governance/workflow-types.ts:9-53`. Pure domain — no
 * Effect, no IO, no application imports.
 */

import type { InterventionEpistemicStatus } from './intervention';

declare const EpistemicBrand: unique symbol;

export type Observed<T>       = T & { readonly [EpistemicBrand]: 'observed' };
export type Interpreted<T>    = T & { readonly [EpistemicBrand]: 'interpreted' };
export type ReviewRequired<T> = T & { readonly [EpistemicBrand]: 'review-required' };
export type Approved<T>       = T & { readonly [EpistemicBrand]: 'approved' };
export type Blocked<T>        = T & { readonly [EpistemicBrand]: 'blocked' };
export type Informational<T>  = T & { readonly [EpistemicBrand]: 'informational' };

export type EpistemicallyTyped<T, S extends InterventionEpistemicStatus> =
  S extends 'observed' ? Observed<T>
    : S extends 'interpreted' ? Interpreted<T>
      : S extends 'review-required' ? ReviewRequired<T>
        : S extends 'approved' ? Approved<T>
          : S extends 'blocked' ? Blocked<T>
            : S extends 'informational' ? Informational<T>
              : never;

// ─── Predicates ────────────────────────────────────────────────────

export function isObserved<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is Observed<T> {
  return item.epistemicStatus === 'observed';
}
export function isInterpreted<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is Interpreted<T> {
  return item.epistemicStatus === 'interpreted';
}
export function isEpistemicallyReviewRequired<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is ReviewRequired<T> {
  return item.epistemicStatus === 'review-required';
}
export function isEpistemicallyApproved<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is Approved<T> {
  return item.epistemicStatus === 'approved';
}
export function isEpistemicallyBlocked<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is Blocked<T> {
  return item.epistemicStatus === 'blocked';
}
export function isInformational<T extends { epistemicStatus: InterventionEpistemicStatus }>(item: T): item is Informational<T> {
  return item.epistemicStatus === 'informational';
}

// ─── Exhaustive fold ───────────────────────────────────────────────

/**
 * Exhaustive epistemic-status analyzer. Mirrors `foldGovernance`.
 *
 * Adding a new variant to `InterventionEpistemicStatus` will break
 * the build at every fold call site, making the migration explicit
 * and exhaustive instead of silent.
 */
export function foldEpistemicStatus<T extends { epistemicStatus: InterventionEpistemicStatus }, R>(
  item: T,
  cases: {
    observed: (item: Observed<T>) => R;
    interpreted: (item: Interpreted<T>) => R;
    reviewRequired: (item: ReviewRequired<T>) => R;
    approved: (item: Approved<T>) => R;
    blocked: (item: Blocked<T>) => R;
    informational: (item: Informational<T>) => R;
  },
): R {
  switch (item.epistemicStatus) {
    case 'observed': return cases.observed(item as Observed<T>);
    case 'interpreted': return cases.interpreted(item as Interpreted<T>);
    case 'review-required': return cases.reviewRequired(item as ReviewRequired<T>);
    case 'approved': return cases.approved(item as Approved<T>);
    case 'blocked': return cases.blocked(item as Blocked<T>);
    case 'informational': return cases.informational(item as Informational<T>);
  }
}

// ─── Audited mint functions ────────────────────────────────────────

/** Sources that may produce an `Observed` brand. Synthetic, agent-derived,
 *  and document-derived sources are deliberately excluded. */
export type ObservedSource = 'runtime-dom' | 'execution-receipt' | 'evidence-record';

/** Sources that may produce an `Interpreted` brand. */
export type InterpretedSource =
  | 'agent-interpreted'
  | 'knowledge-translation'
  | 'partial-resolution'
  | 'cold-start-discovery';

/**
 * Mint an `Observed<T>` brand. Compile-time gated by `ObservedSource` —
 * synthetic input cannot reach this function because the source enum
 * does not contain a synthetic variant. This is the A2 (synthetic
 * governability) invariant, made type-safe.
 */
export function mintObserved<T>(item: T, _source: ObservedSource): Observed<T> {
  return item as Observed<T>;
}

/** Mint an `Interpreted<T>` brand. */
export function mintInterpreted<T>(item: T, _source: InterpretedSource): Interpreted<T> {
  return item as Interpreted<T>;
}

/** Mint an `Informational<T>` brand. Free-form because informational
 *  payloads are inherently weakly-typed and can come from anywhere. */
export function mintInformational<T>(item: T): Informational<T> {
  return item as Informational<T>;
}

/** Map runtime resolution source strings → epistemic status. Pure.
 *  This is the runtime adapter that the resolution stage uses to choose
 *  the correct brand for a freshly-built receipt. */
export function epistemicStatusForSource(source: string): InterventionEpistemicStatus {
  switch (source) {
    case 'runtime-dom':
    case 'execution-receipt':
    case 'evidence-record':
    case 'live-dom':
    case 'dom-exploration':
      return 'observed';
    case 'agent-interpreted':
    case 'knowledge-translation':
    case 'partial-resolution':
    case 'cold-start-discovery':
    case 'needs-human':
      return 'interpreted';
    case 'human-approval':
    case 'approved-canon':
      return 'approved';
    case 'trust-policy-block':
    case 'governance-block':
      return 'blocked';
    case 'review-pending':
      return 'review-required';
    default:
      return 'informational';
  }
}
