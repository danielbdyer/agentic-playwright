/**
 * SubstrateAssertion — value objects asserting predicates about
 * the substrate state at a moment (before or after a step).
 *
 * Per docs/v2-scenario-corpus-plan.md §3.2, assertions evaluate at
 * pre/post-step boundaries; invariants (sibling module) evaluate
 * over the full trace. This split keeps each predicate's evaluation
 * cost bounded and the closed unions narrow.
 *
 * Pure domain — no Effect, no IO. Folds are exhaustive.
 */

import type { SurfaceRole } from '../../substrate/surface-spec';

/** Closed union of assertion kinds. Each kind names a predicate
 *  the harness evaluates against the live substrate. Adding a kind
 *  requires updating `foldSubstrateAssertion`. */
export type SubstrateAssertion =
  | SurfacePresentAssertion
  | SurfaceAbsentAssertion
  | SurfaceHasValueAssertion
  | SurfaceIsFocusedAssertion
  | SurfaceCountAssertion;

/** "A surface matching this role+name is present in the world." */
export interface SurfacePresentAssertion {
  readonly kind: 'surface-present';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

/** "No surface matching this role+name appears in the world." */
export interface SurfaceAbsentAssertion {
  readonly kind: 'surface-absent';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

/** "The named surface holds the expected value." Requires a name
 *  because value semantics are field-specific. */
export interface SurfaceHasValueAssertion {
  readonly kind: 'surface-has-value';
  readonly target: { readonly role: SurfaceRole; readonly name: string };
  readonly expectedValue: string;
}

/** "Document focus rests on the named surface." Useful for focus-
 *  management invariants pre/post modal-open. */
export interface SurfaceIsFocusedAssertion {
  readonly kind: 'surface-is-focused';
  readonly target: { readonly role: SurfaceRole; readonly name?: string };
}

/** "Exactly N surfaces of this role appear." Useful for pagination,
 *  list-render assertions. */
export interface SurfaceCountAssertion {
  readonly kind: 'surface-count';
  readonly role: SurfaceRole;
  readonly count: number;
}

/** Result of evaluating a single assertion against the substrate.
 *  `held` carries no payload; `violated` carries an observed-vs-
 *  expected diff for human reading. */
export type AssertionOutcome =
  | { readonly kind: 'held' }
  | {
      readonly kind: 'violated';
      readonly observed: string;
      readonly expected: string;
    };

/** Construct a held outcome (constant). */
export const ASSERTION_HELD: AssertionOutcome = { kind: 'held' };

/** Construct a violated outcome with descriptive diffs. */
export function assertionViolated(observed: string, expected: string): AssertionOutcome {
  return { kind: 'violated', observed, expected };
}

/** Exhaustive fold over assertion kinds. Adding a kind without a
 *  corresponding case is a typecheck error. */
export function foldSubstrateAssertion<R>(
  assertion: SubstrateAssertion,
  cases: {
    readonly surfacePresent: (a: SurfacePresentAssertion) => R;
    readonly surfaceAbsent: (a: SurfaceAbsentAssertion) => R;
    readonly surfaceHasValue: (a: SurfaceHasValueAssertion) => R;
    readonly surfaceIsFocused: (a: SurfaceIsFocusedAssertion) => R;
    readonly surfaceCount: (a: SurfaceCountAssertion) => R;
  },
): R {
  switch (assertion.kind) {
    case 'surface-present':    return cases.surfacePresent(assertion);
    case 'surface-absent':     return cases.surfaceAbsent(assertion);
    case 'surface-has-value':  return cases.surfaceHasValue(assertion);
    case 'surface-is-focused': return cases.surfaceIsFocused(assertion);
    case 'surface-count':      return cases.surfaceCount(assertion);
  }
}

/** Exhaustive fold over assertion outcomes. */
export function foldAssertionOutcome<R>(
  outcome: AssertionOutcome,
  cases: {
    readonly held: () => R;
    readonly violated: (o: { readonly observed: string; readonly expected: string }) => R;
  },
): R {
  switch (outcome.kind) {
    case 'held':     return cases.held();
    case 'violated': return cases.violated(outcome);
  }
}
