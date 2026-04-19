import type { Governance } from '../governance/workflow-types';

// ─── Lattice Algebra ───

export interface Lattice<T> {
  readonly meet: (a: T, b: T) => T;
  readonly join: (a: T, b: T) => T;
  readonly order: (a: T, b: T) => boolean;
}

export interface BoundedLattice<T> extends Lattice<T> {
  readonly top: T;
  readonly bottom: T;
}

// ─── Governance Lattice ───
//
// Order: blocked ⊑ review-required ⊑ approved
//   blocked is bottom (most restrictive / infimum)
//   approved is top (most permissive / supremum)
//
// meet = greatest lower bound = most restrictive of two
// join = least upper bound = most permissive of two

const governanceRank: Readonly<Record<Governance, number>> = {
  'blocked': 0,
  'review-required': 1,
  'approved': 2,
};

const rankToGovernance: readonly Governance[] = ['blocked', 'review-required', 'approved'];

const fromRank = (rank: number): Governance => rankToGovernance[rank] ?? 'blocked';

export const GovernanceLattice: BoundedLattice<Governance> = {
  meet: (a, b) => fromRank(Math.min(governanceRank[a], governanceRank[b])),
  join: (a, b) => fromRank(Math.max(governanceRank[a], governanceRank[b])),
  top: 'approved',
  bottom: 'blocked',
  order: (a, b) => governanceRank[a] <= governanceRank[b],
};

/** Alias for GovernanceLattice.meet — returns the most restrictive of two governance values. */
export function mergeGovernance(a: Governance, b: Governance): Governance {
  return GovernanceLattice.meet(a, b);
}

// ─── Generic Helpers ───

export function meetAll<T>(lattice: BoundedLattice<T>, values: readonly T[]): T {
  return values.reduce(lattice.meet, lattice.top);
}

export function joinAll<T>(lattice: BoundedLattice<T>, values: readonly T[]): T {
  return values.reduce(lattice.join, lattice.bottom);
}
