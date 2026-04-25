/**
 * Quotient<T, Tag> laws (W3.1).
 *
 * Pin the equivalence-relation-by-projection algebra and
 * exercise both current instantiations — probe-receipt-invariant
 * (cross-rung parity) and snapshot-signature (cross-capture
 * stability).
 *
 *   L-Quotient-Reflexive:  equal(t, t) for every t.
 *   L-Quotient-Symmetric:  equal(a, b) ⇒ equal(b, a).
 *   L-Quotient-Transitive: equal(a, b) ∧ equal(b, c) ⇒ equal(a, c).
 *   L-Quotient-Deterministic: witness(t) stable across calls.
 *   L-Quotient-Class-Equality: witness(a) = witness(b) ⇔ equal(a, b).
 *
 * The algebra itself (`quotientLaws` helper) exercises these
 * over an equivalent-sample batch + a distinct-sample batch;
 * each instantiation's test calls it with representative inputs.
 */

import { describe, test, expect } from 'vitest';
import {
  makeQuotient,
  quotientLaws,
  quotientOfProjection,
  type Projection,
} from '../../product/domain/algebra/quotient';
import {
  probeReceiptInvariantQuotient,
  type ProbeReceiptInvariantInput,
} from '../../workshop/probe-derivation/probe-receipt';
import {
  snapshotStructuralQuotient,
  type SnapshotNode,
} from '../../workshop/substrate-study/domain/snapshot-record';
import { asFingerprint } from '../../product/domain/kernel/hash';
import { stubNode } from '../__fixtures__/snapshot-node-stub';

describe('Quotient<T, Tag> algebra (W3.1)', () => {
  describe('makeQuotient constructor', () => {
    test('reflexivity holds for any constructed quotient', () => {
      type X = { readonly a: number; readonly b: number };
      const q = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => ({ a: x.a }), // project onto `a`, ignore `b`.
      });
      expect(q.equal({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    });

    test('equality under projection: variant-band inputs collapse to same class', () => {
      type X = { readonly a: number; readonly b: number };
      const q = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => ({ a: x.a }),
      });
      // Same projection (a=1), different variant-band (b).
      expect(q.equal({ a: 1, b: 2 }, { a: 1, b: 99 })).toBe(true);
      expect(q.witness({ a: 1, b: 2 })).toBe(q.witness({ a: 1, b: 99 }));
    });

    test('inequality under projection: different projections → different classes', () => {
      type X = { readonly a: number; readonly b: number };
      const q = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => ({ a: x.a }),
      });
      expect(q.equal({ a: 1, b: 2 }, { a: 2, b: 2 })).toBe(false);
    });

    test('witness is tag-scoped at the type system level', () => {
      type X = { readonly a: number };
      const q = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => x,
      });
      const w = q.witness({ a: 1 });
      // Compile-time: w has type Fingerprint<'cohort'>. Passing
      // it where a Fingerprint<'other-tag'> is expected is a
      // type error. This test asserts the runtime shape only.
      expect(typeof w).toBe('string');
      expect(w.length).toBeGreaterThan(0);
    });
  });

  describe('Projection<T, P> factored form (Move C)', () => {
    test('quotientOfProjection produces equivalent results to makeQuotient', () => {
      type X = { readonly a: number; readonly b: number };
      const project = (x: X): { a: number } => ({ a: x.a });

      const direct = makeQuotient<X, 'cohort'>({ tag: 'cohort', project });
      const factored = quotientOfProjection<X, { a: number }, 'cohort'>({
        tag: 'cohort',
        projection: { project },
      });

      // Same projection + tag → same witnesses for any input.
      const sample: X = { a: 7, b: 99 };
      expect(factored.witness(sample)).toBe(direct.witness(sample));
      expect(factored.tag).toBe(direct.tag);
    });

    test('one Projection<T, P> reused across multiple Quotients yields same equivalence-class', () => {
      // The point of factoring: a single Projection captures
      // the equivalence relation; different tags produce
      // different fingerprint NAMES for the same class.
      type X = { readonly a: number; readonly b: number };
      const projection: Projection<X, { a: number }> = {
        project: (x) => ({ a: x.a }),
      };

      const qReceiptInvariant = quotientOfProjection<X, { a: number }, 'probe-receipt-invariant'>({
        tag: 'probe-receipt-invariant',
        projection,
      });
      const qSnapshotSig = quotientOfProjection<X, { a: number }, 'snapshot-signature'>({
        tag: 'snapshot-signature',
        projection,
      });

      // Inputs with same projection are class-equal under EITHER
      // quotient.
      const left: X = { a: 1, b: 2 };
      const right: X = { a: 1, b: 99 };
      expect(qReceiptInvariant.equal(left, right)).toBe(true);
      expect(qSnapshotSig.equal(left, right)).toBe(true);

      // The runtime witnesses match (the fingerprint hash is
      // computed over the projected value alone — the tag is a
      // phantom-only type marker per product/domain/kernel/hash.ts).
      // The TYPE-level gate prevents cross-tag fingerprint mixing
      // at compile time; runtime values intentionally collide so
      // hash callers can store them in a single Map without
      // collision-by-tag.
      expect(qReceiptInvariant.witness(left)).toBe(qSnapshotSig.witness(left));

      // Tags differ at the type level (cross-tag comparison is a
      // type error) and are accessible via the Quotient.tag field.
      expect(qReceiptInvariant.tag).toBe('probe-receipt-invariant');
      expect(qSnapshotSig.tag).toBe('snapshot-signature');
    });
  });

  describe('quotientLaws law-runner helper', () => {
    test('empty violations array when laws hold', () => {
      type X = { readonly a: number; readonly b: number };
      const q = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => ({ a: x.a }),
      });
      const report = quotientLaws({
        quotient: q,
        equivalentSamples: [
          { a: 1, b: 2 },
          { a: 1, b: 99 },
          { a: 1, b: -3 },
        ],
        distinctSamples: [
          { a: 1, b: 0 },
          { a: 2, b: 0 },
          { a: 3, b: 0 },
        ],
      });
      expect(report.violations).toEqual([]);
    });

    test('violations are reported when equivalent-samples are not class-equal', () => {
      // Deliberately broken projection: the projection depends
      // on `b` instead of `a`, so samples that disagree on `b`
      // will fail class-equality.
      type X = { readonly a: number; readonly b: number };
      const brokenQ = makeQuotient<X, 'cohort'>({
        tag: 'cohort',
        project: (x) => ({ b: x.b }),
      });
      const report = quotientLaws({
        quotient: brokenQ,
        equivalentSamples: [
          { a: 1, b: 2 },
          { a: 1, b: 99 }, // different b → different class
        ],
        distinctSamples: [],
      });
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations[0]).toMatch(/class-equality/);
    });
  });

  describe('probeReceiptInvariantQuotient instance', () => {
    const baseInput: ProbeReceiptInvariantInput = {
      probeId: 'probe:observe:visible-button',
      observedClassification: 'matched',
      observedErrorFamily: null,
      fixtureFingerprint: asFingerprint('content', 'fixture-fp-1'),
      substrateVersion: '1.0.0',
    };

    test('satisfies quotient laws across invariant / variant samples', () => {
      // Equivalent-band batch: all inputs project identically.
      // The quotient's input is just the projection, so these
      // ARE identical by construction; verify class-equality.
      const report = quotientLaws({
        quotient: probeReceiptInvariantQuotient,
        equivalentSamples: [
          { ...baseInput },
          { ...baseInput },
        ],
        distinctSamples: [
          { ...baseInput, probeId: 'probe:observe:other' },
          { ...baseInput, observedClassification: 'failed' },
          { ...baseInput, observedErrorFamily: 'unavailable' },
          { ...baseInput, substrateVersion: '2.0.0' },
          {
            ...baseInput,
            fixtureFingerprint: asFingerprint('content', 'different-fp'),
          },
        ],
      });
      expect(report.violations).toEqual([]);
    });

    test('tag is "probe-receipt-invariant"', () => {
      expect(probeReceiptInvariantQuotient.tag).toBe('probe-receipt-invariant');
    });
  });

  describe('snapshotStructuralQuotient instance', () => {
    test('satisfies quotient laws across equivalent / distinct node lists', () => {
      const baseNodes = [stubNode({ path: 'body > main' })];
      const equivalent1 = baseNodes;
      const equivalent2 = [
        stubNode({
          path: 'body > main',
          // Varying variant-band fields (interaction, visibility,
          // textLengthBucket, etc.) should NOT affect the
          // structural signature.
          interaction: {
            tabindex: 7,
            focusable: true,
            interactive: true,
            formRef: null,
            inputType: null,
            disabled: true,
            readonly: false,
            required: false,
            placeholder: null,
          },
          textLengthBucket: '51+',
          textNodeCount: 42,
        }),
      ];

      const distinctByTag = [stubNode({ path: 'body > main', tag: 'span' })];
      const distinctByRole = [
        stubNode({ path: 'body > main', ariaRole: 'button' }),
      ];
      const distinctByClassFamily = [
        stubNode({ path: 'body > main', classPrefixFamily: 'osui' }),
      ];

      const report = quotientLaws({
        quotient: snapshotStructuralQuotient,
        equivalentSamples: [equivalent1, equivalent2],
        distinctSamples: [distinctByTag, distinctByRole, distinctByClassFamily],
      });
      expect(report.violations).toEqual([]);
    });

    test('node-list reordering produces same witness (internal sort by path)', () => {
      const a = stubNode({ path: 'body > header' });
      const b = stubNode({ path: 'body > main' });
      expect(snapshotStructuralQuotient.witness([a, b])).toBe(
        snapshotStructuralQuotient.witness([b, a]),
      );
    });

    test('tag is "snapshot-signature"', () => {
      expect(snapshotStructuralQuotient.tag).toBe('snapshot-signature');
    });
  });
});
