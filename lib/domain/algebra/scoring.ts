import type { Semigroup, Monoid } from './monoid';

/** A composable scoring rule: maps an input to a numeric score. */
export interface ScoringRule<T> {
  readonly score: (input: T) => number;
}

// ─── Algebraic Constants ───

/** Additive identity — contributes nothing to a combined score. */
export const identityScoringRule = <T>(): ScoringRule<T> => ({ score: () => 0 });

/** Annihilator — signals an unrecoverable scoring failure. */
export const annihilatorScoringRule = <T>(): ScoringRule<T> => ({ score: () => -Infinity });

// ─── Combinators ───

/** Clamps a rule's output to [min, max]. */
export function boundedScoringRule<T>(min: number, max: number, rule: ScoringRule<T>): ScoringRule<T> {
  return { score: (input) => Math.max(min, Math.min(max, rule.score(input))) };
}

/** Tests whether a rule produces the annihilator value for a given input. */
export function isAnnihilator<T>(rule: ScoringRule<T>, testInput: T): boolean {
  return rule.score(testInput) === -Infinity;
}

// ─── Semigroup and Monoid Instances ───

export function scoringRuleSemigroup<T>(): Semigroup<ScoringRule<T>> {
  return {
    combine: (a, b) => ({ score: (input: T) => a.score(input) + b.score(input) }),
  };
}

export function scoringRuleMonoid<T>(): Monoid<ScoringRule<T>> {
  return {
    ...scoringRuleSemigroup<T>(),
    empty: identityScoringRule<T>(),
  };
}
