import { Effect } from 'effect';

// ─── Kleisli Arrow ───
//
// A Kleisli arrow is a function A → F[B] where F is an effect type.
// Pipeline stages are Kleisli arrows: Dependencies → Effect[Computed].
//
// Laws (using ≫ for composeKleisli):
//   Left identity:   id ≫ f  ≡  f
//   Right identity:  f ≫ id  ≡  f
//   Associativity:   (f ≫ g) ≫ h  ≡  f ≫ (g ≫ h)

export interface KleisliArrow<A, B, E, R> {
  readonly run: (a: A) => Effect.Effect<B, E, R>;
}

// ─── Constructors ───

/** Lift a pure function into a Kleisli arrow. */
export function pureKleisli<A, B>(f: (a: A) => B): KleisliArrow<A, B, never, never> {
  return { run: (a) => Effect.succeed(f(a)) };
}

/** Kleisli identity — returns the input unchanged. */
export function identityKleisli<A>(): KleisliArrow<A, A, never, never> {
  return { run: (a) => Effect.succeed(a) };
}

// ─── Composition ───

/** Compose two Kleisli arrows: run f, then feed the result to g. */
export function composeKleisli<A, B, C, E1, R1, E2, R2>(
  f: KleisliArrow<A, B, E1, R1>,
  g: KleisliArrow<B, C, E2, R2>,
): KleisliArrow<A, C, E1 | E2, R1 | R2> {
  return {
    run: (a) =>
      Effect.gen(function* () {
        const b = yield* f.run(a);
        return yield* g.run(b);
      }),
  };
}

// ─── Functor Map ───

/** Post-compose a Kleisli arrow with a pure function. */
export function mapKleisli<A, B, C, E, R>(
  arrow: KleisliArrow<A, B, E, R>,
  f: (b: B) => C,
): KleisliArrow<A, C, E, R> {
  return {
    run: (a) => Effect.map(arrow.run(a), f),
  };
}
