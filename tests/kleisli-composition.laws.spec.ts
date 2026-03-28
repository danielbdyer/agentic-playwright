/**
 * Kleisli Arrow — Algebraic Law Tests (W5.6)
 *
 * Verifies that Kleisli arrow composition satisfies the monad laws
 * (expressed in terms of Kleisli composition):
 *
 *   Left identity:   id ≫ f  ≡  f
 *   Right identity:  f ≫ id  ≡  f
 *   Associativity:   (f ≫ g) ≫ h  ≡  f ≫ (g ≫ h)
 *
 * Also tests pureKleisli and mapKleisli.
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';
import {
  composeKleisli,
  identityKleisli,
  mapKleisli,
  pureKleisli,
} from '../lib/domain/algebra/kleisli';
import type { KleisliArrow } from '../lib/domain/algebra/kleisli';

// ─── Test Arrows ───

const double: KleisliArrow<number, number, never, never> = {
  run: (n) => Effect.succeed(n * 2),
};

const addTen: KleisliArrow<number, number, never, never> = {
  run: (n) => Effect.succeed(n + 10),
};

const square: KleisliArrow<number, number, never, never> = {
  run: (n) => Effect.succeed(n * n),
};

const toString: KleisliArrow<number, string, never, never> = {
  run: (n) => Effect.succeed(String(n)),
};

// ─── Helpers ───

async function runArrow<A, B>(arrow: KleisliArrow<A, B, never, never>, input: A): Promise<B> {
  return Effect.runPromise(arrow.run(input));
}

// ─── Law 1: Left Identity ───

test.describe('Law 1: Left Identity — composeKleisli(id, f) ≡ f', () => {
  test('id ≫ double behaves like double', async () => {
    const composed = composeKleisli(identityKleisli<number>(), double);
    for (const n of [0, 1, 5, -3, 100]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(double, n));
    }
  });

  test('id ≫ addTen behaves like addTen', async () => {
    const composed = composeKleisli(identityKleisli<number>(), addTen);
    for (const n of [0, 1, -10, 42]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(addTen, n));
    }
  });

  test('id ≫ toString behaves like toString', async () => {
    const composed = composeKleisli(identityKleisli<number>(), toString);
    for (const n of [0, 7, -1]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(toString, n));
    }
  });
});

// ─── Law 2: Right Identity ───

test.describe('Law 2: Right Identity — composeKleisli(f, id) ≡ f', () => {
  test('double ≫ id behaves like double', async () => {
    const composed = composeKleisli(double, identityKleisli<number>());
    for (const n of [0, 1, 5, -3, 100]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(double, n));
    }
  });

  test('addTen ≫ id behaves like addTen', async () => {
    const composed = composeKleisli(addTen, identityKleisli<number>());
    for (const n of [0, 1, -10, 42]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(addTen, n));
    }
  });

  test('toString ≫ id behaves like toString', async () => {
    const composed = composeKleisli(toString, identityKleisli<string>());
    for (const n of [0, 7, -1]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(toString, n));
    }
  });
});

// ─── Law 3: Associativity ───

test.describe('Law 3: Associativity — (f ≫ g) ≫ h ≡ f ≫ (g ≫ h)', () => {
  test('(double ≫ addTen) ≫ square ≡ double ≫ (addTen ≫ square)', async () => {
    const leftAssoc = composeKleisli(composeKleisli(double, addTen), square);
    const rightAssoc = composeKleisli(double, composeKleisli(addTen, square));
    for (const n of [0, 1, 3, 5, -2, 10]) {
      expect(await runArrow(leftAssoc, n)).toBe(await runArrow(rightAssoc, n));
    }
  });

  test('(addTen ≫ double) ≫ toString ≡ addTen ≫ (double ≫ toString)', async () => {
    const leftAssoc = composeKleisli(composeKleisli(addTen, double), toString);
    const rightAssoc = composeKleisli(addTen, composeKleisli(double, toString));
    for (const n of [0, 1, -5, 42]) {
      expect(await runArrow(leftAssoc, n)).toBe(await runArrow(rightAssoc, n));
    }
  });

  test('(square ≫ double) ≫ addTen ≡ square ≫ (double ≫ addTen)', async () => {
    const leftAssoc = composeKleisli(composeKleisli(square, double), addTen);
    const rightAssoc = composeKleisli(square, composeKleisli(double, addTen));
    for (const n of [0, 1, 2, 4, -3]) {
      expect(await runArrow(leftAssoc, n)).toBe(await runArrow(rightAssoc, n));
    }
  });
});

// ─── pureKleisli ───

test.describe('pureKleisli — lift a pure function', () => {
  test('pureKleisli lifts correctly', async () => {
    const arrow = pureKleisli((n: number) => n + 1);
    expect(await runArrow(arrow, 0)).toBe(1);
    expect(await runArrow(arrow, 41)).toBe(42);
  });

  test('pureKleisli composes with effectful arrows', async () => {
    const inc = pureKleisli((n: number) => n + 1);
    const composed = composeKleisli(inc, double);
    expect(await runArrow(composed, 4)).toBe(10); // (4 + 1) * 2
  });

  test('pureKleisli(id) is the identity arrow', async () => {
    const pureId = pureKleisli((x: number) => x);
    const composed = composeKleisli(pureId, double);
    for (const n of [0, 1, 5]) {
      expect(await runArrow(composed, n)).toBe(await runArrow(double, n));
    }
  });
});

// ─── mapKleisli ───

test.describe('mapKleisli — post-compose with a pure function', () => {
  test('mapKleisli applies pure function to output', async () => {
    const mapped = mapKleisli(double, (n) => n + 1);
    expect(await runArrow(mapped, 5)).toBe(11); // 5 * 2 + 1
  });

  test('mapKleisli with identity is a no-op', async () => {
    const mapped = mapKleisli(double, (n) => n);
    for (const n of [0, 3, -7]) {
      expect(await runArrow(mapped, n)).toBe(await runArrow(double, n));
    }
  });

  test('mapKleisli(f, g) ≡ composeKleisli(f, pureKleisli(g))', async () => {
    const g = (n: number) => n + 100;
    const viaMapped = mapKleisli(double, g);
    const viaCompose = composeKleisli(double, pureKleisli(g));
    for (const n of [0, 1, 5, -2]) {
      expect(await runArrow(viaMapped, n)).toBe(await runArrow(viaCompose, n));
    }
  });
});
