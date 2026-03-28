import type { ValidationRule, ValidationDiagnostic } from '../validation/rules';

// ─── Semigroup and Monoid ───

export interface Semigroup<T> {
  readonly combine: (a: T, b: T) => T;
}

export interface Monoid<T> extends Semigroup<T> {
  readonly empty: T;
}

// ─── ValidationRule Monoid ───
//
// Identity: validate always returns [] (no diagnostics).
// Combine: concatenates diagnostics from both rules.

export function validationRuleMonoid<T>(): Monoid<ValidationRule<T>> {
  return {
    empty: { validate: () => [] as readonly ValidationDiagnostic[] },
    combine: (a, b) => ({
      validate: (input: T) => [...a.validate(input), ...b.validate(input)] as readonly ValidationDiagnostic[],
    }),
  };
}

// ─── Generic Utilities ───

export function concatAll<T>(monoid: Monoid<T>, values: readonly T[]): T {
  return values.reduce(monoid.combine, monoid.empty);
}

export function foldMap<T, M>(monoid: Monoid<M>, values: readonly T[], f: (t: T) => M): M {
  return values.reduce((acc, t) => monoid.combine(acc, f(t)), monoid.empty);
}
