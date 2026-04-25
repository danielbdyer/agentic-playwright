/**
 * Ladder<RungId> — a totally-ordered preorder of rungs with
 * a projection from "lower" to "higher" grounding.
 *
 * ## The pattern this names
 *
 * Multiple ladders coexist in the codebase, each a chain of
 * grounding levels:
 *
 *   - Substrate ladder (4 rungs) — `dry-harness` →
 *     `fixture-replay` → `playwright-live` →
 *     `commoncrawl-derived`. Each rung adds world-shape
 *     evidence.
 *   - Resolution-precedence ladder (11 rungs) — explicit →
 *     operator-override → agentic-override →
 *     deterministic-observation → live-derivation →
 *     cold-derivation → shared-patterns → ... Each rung
 *     adds interpretation effort.
 *   - Locator-strategy ladder (6 rungs) — role → label →
 *     placeholder → text → test-id → css. Each rung adds
 *     selector specificity.
 *
 * They share an algebraic shape:
 *
 *   - Closed-set RungId values, ordered.
 *   - `precedes(a, b): boolean` — total order.
 *   - `meet(a, b): RungId` — lowest common rung (lower-bound).
 *   - `join(a, b): RungId` — highest common rung (upper-bound).
 *   - `findFirst(rungs, predicate): RungId | null` — walk in
 *     order, return the first that satisfies.
 *
 * `Ladder<RungId>` factors this shape so each instance reuses
 * the algebra. The `foldGroundingLattice(substrate, resolution)`
 * helper folds two ladders' (lower, upper) cells into a 2-D
 * `Substrate × Resolution` grounding lattice — the abstraction
 * Agent A's #4 named.
 *
 * Pure domain — no Effect, no IO.
 */

import { closedUnion, type ClosedUnion } from './closed-union';

/** A totally-ordered preorder of RungIds. The runtime values
 *  array carries the order; precedes / meet / join derive from
 *  the array index. */
export interface Ladder<RungId extends string> {
  /** The closed-union witness for the rung values. */
  readonly union: ClosedUnion<RungId>;
  /** True iff `a` precedes (or equals) `b` in the ladder's
   *  declared order. */
  readonly precedes: (a: RungId, b: RungId) => boolean;
  /** Lower-bound of two rungs (the earlier one in declaration
   *  order). */
  readonly meet: (a: RungId, b: RungId) => RungId;
  /** Upper-bound of two rungs (the later one in declaration
   *  order). */
  readonly join: (a: RungId, b: RungId) => RungId;
  /** The bottom rung — the meet's identity. */
  readonly bottom: RungId;
  /** The top rung — the join's identity. */
  readonly top: RungId;
  /** Walk the ladder in declaration order, returning the first
   *  rung that satisfies the predicate. Null when none does. */
  readonly findFirst: (predicate: (r: RungId) => boolean) => RungId | null;
}

/** Construct a Ladder<RungId> from an ordered values array.
 *  Order in the array IS the ladder order: `values[0]` is
 *  bottom, `values[length - 1]` is top. */
export function makeLadder<RungId extends string>(
  values: readonly RungId[],
): Ladder<RungId> {
  if (values.length === 0) {
    throw new Error('makeLadder: ladder must have at least one rung');
  }
  const union = closedUnion<RungId>(values);
  const indexOf = (r: RungId): number => values.indexOf(r);
  const precedes = (a: RungId, b: RungId): boolean =>
    indexOf(a) <= indexOf(b);
  const meet = (a: RungId, b: RungId): RungId =>
    indexOf(a) <= indexOf(b) ? a : b;
  const join = (a: RungId, b: RungId): RungId =>
    indexOf(a) >= indexOf(b) ? a : b;
  const bottom = values[0]!;
  const top = values[values.length - 1]!;
  const findFirst = (predicate: (r: RungId) => boolean): RungId | null => {
    for (const v of values) {
      if (predicate(v)) return v;
    }
    return null;
  };
  return Object.freeze({
    union,
    precedes,
    meet,
    join,
    bottom,
    top,
    findFirst,
  });
}

// ─── 2-D grounding lattice (Substrate × Resolution) ─────────

/** A cell in the grounding lattice: the (substrate-rung,
 *  resolution-rung) pair an artifact occupies. */
export interface GroundingCell<S extends string, R extends string> {
  readonly substrate: S;
  readonly resolution: R;
}

/** Exhaustive fold over the 2-D grounding lattice. The cases
 *  callback receives every (substrate, resolution) pair from
 *  the cartesian product; callers fold cells into per-cell
 *  values. Useful for compounding-engine matrix sweeps where
 *  metrics live at the intersection of substrate evidence and
 *  resolution effort.
 *
 *  Example:
 *
 *    const cellMetrics = foldGroundingLattice({
 *      substrate: substrateLadder,
 *      resolution: resolutionLadder,
 *      cell: ({ substrate, resolution }) =>
 *        computeMetricFor(substrate, resolution),
 *    });
 *
 *  Returns `Record<string, Result>` keyed by `${substrate}|
 *  ${resolution}` for stable lookup. */
export function foldGroundingLattice<
  S extends string,
  R extends string,
  Result,
>(input: {
  readonly substrate: Ladder<S>;
  readonly resolution: Ladder<R>;
  readonly cell: (cell: GroundingCell<S, R>) => Result;
}): Readonly<Record<string, Result>> {
  const result: Record<string, Result> = {};
  for (const s of input.substrate.union.values) {
    for (const r of input.resolution.union.values) {
      const key = `${s}|${r}`;
      result[key] = input.cell({ substrate: s, resolution: r });
    }
  }
  return Object.freeze(result);
}

/** Compose a key from a GroundingCell — exposed so callers can
 *  look up `Record<string, Result>` entries from a typed cell
 *  without re-splicing the format. */
export function groundingCellKey<S extends string, R extends string>(
  cell: GroundingCell<S, R>,
): string {
  return `${cell.substrate}|${cell.resolution}`;
}
