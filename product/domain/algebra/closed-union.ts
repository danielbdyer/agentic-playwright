/**
 * ClosedUnion<T> — runtime witness for a closed string-literal
 * union, paired with its exhaustive-record companion.
 *
 * ## The pattern this names
 *
 * Closed string-literal unions need three artifacts together:
 *
 *   1. The union type itself (`type Foo = 'a' | 'b' | 'c'`).
 *   2. A runtime array of every value (`FOO_VALUES`) so callers
 *      can iterate the union — needed by manifest emission,
 *      dashboard projection, fuzz-test enumeration, etc.
 *   3. A `Record<Foo, true>` exhaustiveness companion that
 *      sits as a stale-detector: future readers know "this
 *      array is meant to enumerate the union exactly."
 *
 * Eight sites in this codebase implement this triple ad-hoc
 * (SURFACE_ROLE_VALUES, SURFACE_VISIBILITY_VALUES,
 * PARITY_DIVERGENCE_AXIS_VALUES, WORKFLOW_STAGE_VALUES,
 * WORKFLOW_SCOPE_VALUES, WORKFLOW_LANE_VALUES,
 * RESOLUTION_MODE_VALUES, REASONING_OP_VALUES). Each repeats
 * a 12-line incantation:
 *
 *   const FOO_VALUES: readonly Foo[] = [...] as const;
 *   const _FOO_EXHAUSTIVE: Record<Foo, true> = Object.freeze(
 *     FOO_VALUES.reduce<Record<Foo, true>>(
 *       (acc, v) => ({ ...acc, [v]: true }),
 *       {} as Record<Foo, true>,
 *     ),
 *   );
 *   void _FOO_EXHAUSTIVE;
 *
 * `closedUnion<T>(values)` compresses this to one line.
 *
 * ## Compile-time discipline note
 *
 * This factory is RUNTIME-shape-only: TypeScript trusts the
 * `T` type parameter and doesn't independently verify that
 * `values` covers every union member (the current ad-hoc
 * pattern has the same limitation — the `as` cast on the
 * accumulator hides missing-value gaps from the type-checker).
 *
 * The compile-time guarantee comes from the **paired fold**
 * function. Every `*_VALUES` declaration has a sibling
 * `fold*` whose case-object is keyed by the union; adding a
 * variant to the union without updating the fold's case keys
 * fails type-check at the fold callsite. The discipline is:
 *
 *   - `closedUnion<T>(values)` provides VALUES + the runtime
 *     companion.
 *   - `fold<T>` provides the compile-time exhaustiveness
 *     guarantee.
 *
 * Both are required for full safety; this factory only
 * compresses the runtime half.
 *
 * Pure domain — no Effect, no IO.
 */

/** A closed-union witness: the runtime values + the
 *  exhaustive-record companion (frozen). */
export interface ClosedUnion<T extends string> {
  /** Every member of the union, in declaration order. */
  readonly values: readonly T[];
  /** Frozen `Record<T, true>` whose keys correspond to the
   *  values. Used as a runtime sentinel: readers iterating
   *  this object know they're walking the closed set. */
  readonly assertExhaustive: Readonly<Record<T, true>>;
}

/** Construct a `ClosedUnion<T>` from the union's values.
 *
 *  Caller supplies `T` as the type parameter and the values
 *  array; the factory derives both fields:
 *
 *    type Color = 'red' | 'green' | 'blue';
 *    export const COLOR = closedUnion<Color>([
 *      'red',
 *      'green',
 *      'blue',
 *    ]);
 *    // COLOR.values: readonly Color[]
 *    // COLOR.assertExhaustive: Readonly<Record<Color, true>>
 *
 *  Pair with a `foldColor` function whose case object is keyed
 *  by the union for compile-time exhaustiveness. */
export function closedUnion<T extends string>(
  values: readonly T[],
): ClosedUnion<T> {
  const assertExhaustive: Readonly<Record<T, true>> = Object.freeze(
    values.reduce<Record<T, true>>(
      (acc, v) => ({ ...acc, [v]: true }),
      {} as Record<T, true>,
    ),
  );
  return Object.freeze({
    values,
    assertExhaustive,
  });
}
