/**
 * Quotient<T, Tag> — an equivalence-relation-by-projection
 * with a tagged fingerprint witness.
 *
 * ## The pattern this names
 *
 * Recurs throughout the codebase: a type `T` has a subset of
 * "invariant-band" axes that define an equivalence relation
 * `≈` (t1 ≈ t2 iff their projections onto those axes are
 * equal). A Quotient<T, Tag> carries:
 *
 *   1. `project: (t: T) => P`  — pure projection onto the
 *      invariant axes. The output type `P` is not part of the
 *      public surface; callers see only a tagged fingerprint.
 *   2. `witness: (t: T) => Fingerprint<Tag>` — sha256 of the
 *      projection, tagged so the type system prevents misuse
 *      as any other kind of fingerprint.
 *   3. `equal: (a: T, b: T) => boolean` — equality-under-
 *      projection, derived from witness.
 *
 * ## Why it's named
 *
 * Four recurring callsites implement this pattern ad-hoc
 * today (Agent-A audit 2026-04-24):
 *
 *   • Probe-receipt `invariantContent` — partitions receipts
 *     across rungs into parity-equivalence classes. Lives at
 *     `workshop/probe-derivation/probe-receipt.ts:computeInvariantContent`.
 *   • Snapshot-record `structuralSignature` — partitions
 *     captures across hydration-validation re-snapshots. Lives
 *     at `workshop/substrate-study/domain/snapshot-record.ts:
 *     computeStructuralSignature`.
 *   • Cohort key `cohortKey: Cohort → string` — partitions
 *     cohorts by identity for trajectory bucketing. Lives at
 *     `workshop/compounding/domain/cohort.ts:cohortKey`.
 *   • ADO-content `fingerprintAdoContent` — partitions ADO
 *     snapshots by semantic content (ignoring cosmetic
 *     fields). Lives at `product/domain/kernel/hash.ts:
 *     fingerprintAdoContent`.
 *
 * Each implements the same shape (pure projection + sha256 +
 * equality-derived-from-hash). A shared `Quotient<T, Tag>`
 * abstraction surfaces the algebra and lets laws apply
 * uniformly across all four.
 *
 * ## Algebraic content
 *
 * Quotient witnesses an equivalence relation:
 *   reflexive:  equal(t, t) = true
 *   symmetric:  equal(a, b) = equal(b, a)
 *   transitive: equal(a, b) ∧ equal(b, c) ⇒ equal(a, c)
 *
 * The witness function additionally satisfies:
 *   determinism: witness(t) = witness(t) across invocations
 *   purity:      witness is a pure function of project(t)
 *   class-equality: witness(a) = witness(b) ⇔ equal(a, b)
 *
 * These properties are testable uniformly via `quotientLaws`
 * in the sibling test helper (tests/algebra/quotient.laws.spec.ts).
 *
 * Pure domain — no Effect, no IO.
 */

import {
  fingerprintFor,
  type Fingerprint,
  type FingerprintTag,
} from '../kernel/hash';

/** The quotient algebra itself. An instance is a witness that
 *  `T` has an equivalence relation induced by projection onto
 *  invariant-band axes. */
export interface Quotient<T, Tag extends FingerprintTag> {
  /** The fingerprint tag uniquely identifying this quotient.
   *  Prevents cross-quotient fingerprint comparison at the
   *  type level. */
  readonly tag: Tag;
  /** Compute the invariant-band fingerprint. Pure. Same inputs
   *  yield same fingerprint across invocations. */
  readonly witness: (t: T) => Fingerprint<Tag>;
  /** Equality-under-projection. Derived from witness;
   *  included as a helper so callers don't string-compare
   *  manually. */
  readonly equal: (a: T, b: T) => boolean;
}

/** Construct a Quotient<T, Tag> from a pure projection.
 *
 *  The `project` function pulls out the invariant-band axes
 *  as a serializable value; `fingerprintFor(tag, projected)`
 *  produces the tagged witness. The projected type is not
 *  exposed to callers — only the tagged fingerprint surfaces.
 *
 *  Callers supply `T`, `Tag`, and `project`; `witness` and
 *  `equal` are derived.
 *
 *  Example:
 *
 *    interface Receipt { probeId: string; obs: ...; timing: ...; }
 *    const receiptQuotient = makeQuotient<Receipt, 'receipt-invariant'>({
 *      tag: 'receipt-invariant',
 *      project: (r) => ({ probeId: r.probeId, obs: r.obs }),
 *    });
 *    receiptQuotient.witness(r1) === receiptQuotient.witness(r2)
 *    // iff r1 and r2 agree on probeId + obs, regardless of timing.
 */
export function makeQuotient<T, Tag extends FingerprintTag>(input: {
  readonly tag: Tag;
  readonly project: (t: T) => unknown;
}): Quotient<T, Tag> {
  const witness = (t: T): Fingerprint<Tag> =>
    fingerprintFor(input.tag, input.project(t));
  const equal = (a: T, b: T): boolean => witness(a) === witness(b);
  return {
    tag: input.tag,
    witness,
    equal,
  };
}

/** Verify the quotient laws over a sample of T values.
 *  Returns an array of violations; empty array means all
 *  laws hold. Used by law-style tests to exercise new
 *  quotient instances.
 *
 *  The caller supplies sample values + at least one
 *  "differently-projected" pair (to verify class-inequality
 *  when projections differ). */
export interface QuotientLawReport {
  readonly violations: readonly string[];
}

export function quotientLaws<T, Tag extends FingerprintTag>(input: {
  readonly quotient: Quotient<T, Tag>;
  /** Samples that should all be in the same equivalence class
   *  (e.g., differ only on variant-band fields). */
  readonly equivalentSamples: readonly T[];
  /** Samples that should all be in distinct classes (projections
   *  differ). */
  readonly distinctSamples: readonly T[];
}): QuotientLawReport {
  const { quotient, equivalentSamples, distinctSamples } = input;
  const allSamples: readonly T[] = [
    ...equivalentSamples,
    ...distinctSamples,
  ];

  // Reflexivity on every sample.
  const reflexivityViolations: readonly string[] = allSamples
    .filter((t) => !quotient.equal(t, t))
    .map(() => 'reflexivity: equal(t, t) should be true');

  // Equivalent samples form one class (all witnesses equal).
  const classEqualityViolations: readonly string[] =
    equivalentSamples.length < 2
      ? []
      : equivalentSamples
          .slice(1)
          .flatMap((sample, i) =>
            quotient.witness(sample) === quotient.witness(equivalentSamples[0]!)
              ? []
              : [
                  `equivalentSamples: witness(${i + 1}) !== witness(0) (expected class-equality)`,
                ],
          );

  // Distinct samples form distinct classes (pairwise witness
  // inequality).
  const distinctClassViolations: readonly string[] =
    distinctSamples.flatMap((a, i) =>
      distinctSamples
        .slice(i + 1)
        .flatMap((b, offset) =>
          quotient.equal(a, b)
            ? [
                `distinctSamples[${i}] and distinctSamples[${
                  i + offset + 1
                }] should be in distinct classes`,
              ]
            : [],
        ),
    );

  // Determinism: witness is stable across invocations on the
  // same input.
  const determinismViolations: readonly string[] = allSamples.flatMap((t) =>
    quotient.witness(t) === quotient.witness(t)
      ? []
      : ['determinism: witness(t) should be stable across calls'],
  );

  const violations: readonly string[] = [
    ...reflexivityViolations,
    ...classEqualityViolations,
    ...distinctClassViolations,
    ...determinismViolations,
  ];
  return { violations };
}
