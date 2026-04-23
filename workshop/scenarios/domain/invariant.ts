/**
 * Invariant — value objects asserting properties over a complete
 * scenario trace.
 *
 * Where SubstrateAssertions evaluate at one moment (pre/post a
 * step), Invariants evaluate over the entire StepOutcome[] sequence
 * — they're predicates about the trajectory.
 *
 * Per docs/v2-scenario-corpus-plan.md §3.3, the seed set covers
 * five distinct cross-step properties. Adding an invariant kind
 * requires updating `foldInvariant` (closed-union discipline).
 *
 * Pure domain.
 */

import type { SurfaceRole } from '../../substrate/surface-spec';

/** Closed union of invariant kinds. */
export type Invariant =
  | AriaAlertAnnouncesExactlyOnce
  | FocusStaysWithinLandmark
  | FormStatePreservedOnNavigation
  | ValidationErrorsClearOnCorrection
  | CrossVerbStrategyPreference;

/** "Across the trace, an alert with this name appears at most once
 *  in the rendered DOM." Tests against the live-region duplicate-
 *  announcement anti-pattern. */
export interface AriaAlertAnnouncesExactlyOnce {
  readonly kind: 'aria-alert-announces-exactly-once';
  readonly target: { readonly role: 'alert'; readonly name: string };
}

/** "Document focus never leaves this landmark across the trace."
 *  Tests modal-trap / sidebar-trap discipline. */
export interface FocusStaysWithinLandmark {
  readonly kind: 'focus-stays-within-landmark';
  readonly landmark: {
    readonly role: 'main' | 'navigation' | 'complementary';
    readonly name?: string;
  };
}

/** "Named form's field values persist across navigate-step
 *  transitions." Tests cross-page state retention. */
export interface FormStatePreservedOnNavigation {
  readonly kind: 'form-state-preserved-on-navigation';
  readonly formName: string;
  readonly fieldNames: readonly string[];
}

/** "Once an error alert appears, completing the named field clears
 *  it before the next step." Tests the correction-feedback loop. */
export interface ValidationErrorsClearOnCorrection {
  readonly kind: 'validation-errors-clear-on-correction';
  readonly fieldName: string;
  readonly errorAlertName: string;
}

/** "After locator-health-track records a failure for the named
 *  facet+strategy, subsequent observe steps prefer the alternate
 *  strategy." Tests memory-driven cross-verb behavior. */
export interface CrossVerbStrategyPreference {
  readonly kind: 'cross-verb-strategy-preference';
  readonly facetId: string;
  readonly failedStrategy: string;
  readonly preferredAlternate: string;
}

/** Result of evaluating an invariant. `held` carries an evidence
 *  string (e.g., "alert appeared 1 time at step 3"); `violated`
 *  carries the observed sequence + the expected property name. */
export type InvariantOutcome =
  | { readonly kind: 'held'; readonly evidence: string }
  | {
      readonly kind: 'violated';
      readonly observedSequence: readonly string[];
      readonly expectedProperty: string;
    };

export function invariantHeld(evidence: string): InvariantOutcome {
  return { kind: 'held', evidence };
}

export function invariantViolated(
  observedSequence: readonly string[],
  expectedProperty: string,
): InvariantOutcome {
  return { kind: 'violated', observedSequence, expectedProperty };
}

/** Exhaustive fold over invariant kinds. */
export function foldInvariant<R>(
  invariant: Invariant,
  cases: {
    readonly ariaAlertOnce: (i: AriaAlertAnnouncesExactlyOnce) => R;
    readonly focusStays: (i: FocusStaysWithinLandmark) => R;
    readonly formStatePreserved: (i: FormStatePreservedOnNavigation) => R;
    readonly validationClears: (i: ValidationErrorsClearOnCorrection) => R;
    readonly crossVerbStrategy: (i: CrossVerbStrategyPreference) => R;
  },
): R {
  switch (invariant.kind) {
    case 'aria-alert-announces-exactly-once':    return cases.ariaAlertOnce(invariant);
    case 'focus-stays-within-landmark':          return cases.focusStays(invariant);
    case 'form-state-preserved-on-navigation':   return cases.formStatePreserved(invariant);
    case 'validation-errors-clear-on-correction': return cases.validationClears(invariant);
    case 'cross-verb-strategy-preference':       return cases.crossVerbStrategy(invariant);
  }
}

export function foldInvariantOutcome<R>(
  outcome: InvariantOutcome,
  cases: {
    readonly held: (o: { readonly evidence: string }) => R;
    readonly violated: (o: {
      readonly observedSequence: readonly string[];
      readonly expectedProperty: string;
    }) => R;
  },
): R {
  switch (outcome.kind) {
    case 'held':     return cases.held(outcome);
    case 'violated': return cases.violated(outcome);
  }
}

/** Auxiliary accessor: kind extraction for invariants — useful
 *  when grouping by kind without folding. */
export function invariantKind(invariant: Invariant): Invariant['kind'] {
  return invariant.kind;
}

/** Closed-union landmark roles allowed in FocusStaysWithinLandmark.
 *  Narrower than SurfaceRole — only navigable landmarks. */
export function isFocusLandmarkRole(value: SurfaceRole): value is 'main' | 'navigation' | 'complementary' {
  return value === 'main' || value === 'navigation' || value === 'complementary';
}
