/**
 * PartialIso<A, B> — a total forward + partial inverse.
 *
 * ## The pattern this names
 *
 * Several wire-format crossings in the codebase share a shape:
 *
 *   - WorldShape ↔ URL query string (workshop/substrate/world-shape.ts)
 *   - ProbeFixtureDocument YAML ↔ ProbeIR fixture parse
 *   - Cohort ↔ cohort-key string (workshop/compounding/domain/cohort.ts)
 *   - parsed-intent ↔ manifest-input descriptor
 *
 * Each is a `total forward` + `partial inverse` pair:
 *
 *   forward: A → B           (always succeeds)
 *   inverse: B → A | null    (returns null on malformed input)
 *
 * Together they form a partial isomorphism — the "Curry-Howard"
 * pattern v2-substrate.md §6 calls "no parallel apparatus":
 * every wire-format crossing has a witness that the
 * round-trip is well-defined.
 *
 * ## Laws
 *
 * The canonical round-trip law:
 *
 *    inverse(forward(a)) ≡ Just(a)        for every a: A
 *
 * The reverse round-trip is partial — not every B is a valid
 * forward image, so:
 *
 *    forward(inverse(b))
 *      ≡ Just(b')       where forward(b') = canonical(b)   (when inverse succeeds)
 *      ≡ unspecified    (when inverse(b) = null)
 *
 * `partialIsoLaws` exercises the forward round-trip on a
 * supplied sample.
 *
 * Pure domain — no Effect, no IO.
 */

/** A partial isomorphism between A and B. The forward
 *  direction is total; the inverse is partial (returns null
 *  on malformed input). */
export interface PartialIso<A, B> {
  /** Total: every A maps to a B. */
  readonly forward: (a: A) => B;
  /** Partial: not every B is a valid forward image. Returns
   *  null when `b` cannot be parsed back. */
  readonly inverse: (b: B) => A | null;
}

/** Construct a PartialIso<A, B> from forward + inverse. Pure. */
export function partialIso<A, B>(input: {
  readonly forward: (a: A) => B;
  readonly inverse: (b: B) => A | null;
}): PartialIso<A, B> {
  return { forward: input.forward, inverse: input.inverse };
}

/** Verify the canonical round-trip law on a sample of A
 *  values + a separate sample of malformed B values. Returns
 *  an array of violations; empty means all laws hold. */
export interface PartialIsoLawReport {
  readonly violations: readonly string[];
}

export function partialIsoLaws<A, B>(input: {
  readonly iso: PartialIso<A, B>;
  /** Inputs whose round-trip should reconstruct identically. */
  readonly forwardSamples: readonly A[];
  /** B values that should fail to parse (inverse = null). */
  readonly invalidInverseSamples?: readonly B[];
  /** How to compare two A values for equality. Defaults to
   *  JSON-stable comparison. */
  readonly equals?: (a: A, b: A) => boolean;
}): PartialIsoLawReport {
  const equals =
    input.equals ?? ((a: A, b: A) => JSON.stringify(a) === JSON.stringify(b));

  const violations: readonly string[] = [
    ...input.forwardSamples.flatMap((a, i) => {
      const round = input.iso.inverse(input.iso.forward(a));
      if (round === null) {
        return [
          `forwardSamples[${i}]: inverse(forward(a)) returned null (round-trip failed)`,
        ];
      }
      if (!equals(round, a)) {
        return [
          `forwardSamples[${i}]: inverse(forward(a)) ≠ a (round-trip lost information)`,
        ];
      }
      return [];
    }),
    ...(input.invalidInverseSamples ?? []).flatMap((b, i) =>
      input.iso.inverse(b) !== null
        ? [`invalidInverseSamples[${i}]: inverse should have returned null but didn't`]
        : [],
    ),
  ];

  return { violations };
}
