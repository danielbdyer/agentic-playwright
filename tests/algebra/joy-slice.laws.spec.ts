/**
 * Joy-slice algebra laws.
 *
 * Three small algebraic wins from Agent A's audit, exercised
 * via their canonical laws:
 *
 *   Q (ProposalEnvelope mapPayload):  functor laws (identity +
 *                                     composition)
 *
 *   R (WorldShape override monoid):   identity + associativity
 *                                     + right-bias
 *
 *   V (Cohort Iso):                   round-trip cohortKey ∘
 *                                     parseCohortKey ≡ id; failed
 *                                     parses return null.
 */

import { describe, test, expect } from 'vitest';
import {
  candidateEnvelope,
  hypothesisEnvelope,
  mapPayloadProposal,
  revisionEnvelope,
} from '../../product/domain/proposal/kind';
import {
  EMPTY_WORLD_SHAPE,
  worldShapeOverrideMonoid,
  type WorldShape,
} from '../../workshop/substrate/world-shape';
import { cohortKey, parseCohortKey, type Cohort } from '../../workshop/compounding/domain/cohort';
import type { SurfaceSpec } from '../../workshop/substrate/surface-spec';

// ─── Q: ProposalEnvelope mapPayload functor laws ────────────

describe('Q — ProposalEnvelope mapPayload (functor)', () => {
  test('L-Functor-Identity: mapPayloadProposal(env, x => x) ≡ env', () => {
    const env = hypothesisEnvelope(
      'rationale',
      { axis: 'pipeline-fitness', delta: 0.1, direction: 'increase' } as never,
      { foo: 42 },
    );
    const mapped = mapPayloadProposal(env, (x) => x);
    expect(mapped).toEqual(env);
  });

  test('L-Functor-Composition: mapPayloadProposal(map(env, f), g) ≡ map(env, x => g(f(x)))', () => {
    const env = candidateEnvelope('r', { count: 5 });
    const f = (p: { count: number }): { count: number; doubled: number } => ({
      count: p.count,
      doubled: p.count * 2,
    });
    const g = (p: { count: number; doubled: number }): string =>
      `count=${p.count} doubled=${p.doubled}`;
    const composed = mapPayloadProposal(mapPayloadProposal(env, f), g);
    const fused = mapPayloadProposal(env, (x) => g(f(x)));
    expect(composed).toEqual(fused);
  });

  test('preserves kind / rationale / predictedDelta on revision envelope', () => {
    const env = revisionEnvelope('reason', { v: 1 });
    const mapped = mapPayloadProposal(env, (p) => ({ ...p, w: 2 }));
    expect(mapped.kind).toBe('revision');
    expect(mapped.rationale).toBe('reason');
    expect(mapped.payload).toEqual({ v: 1, w: 2 });
  });

  test('preserves predictedDelta on hypothesis envelope', () => {
    const delta = { axis: 'pipeline-fitness', delta: 0.5, direction: 'increase' } as never;
    const env = hypothesisEnvelope('r', delta, { x: 1 });
    const mapped = mapPayloadProposal(env, (p) => ({ ...p, y: 2 }));
    expect(mapped.predictedDelta).toBe(delta);
  });
});

// ─── R: WorldShape override monoid laws ─────────────────────

describe('R — WorldShape override monoid', () => {
  const surfaceA: SurfaceSpec = { role: 'button', name: 'A' };
  const surfaceB: SurfaceSpec = { role: 'link', name: 'B' };
  const surfaceC: SurfaceSpec = { role: 'heading', name: 'C' };

  test('L-Monoid-Left-Identity: combine(empty, x) ≡ x', () => {
    const x: WorldShape = { surfaces: [surfaceA], preset: 'login' };
    const result = worldShapeOverrideMonoid.combine(EMPTY_WORLD_SHAPE, x);
    expect(result).toEqual(x);
  });

  test('L-Monoid-Right-Identity: combine(x, empty) ≡ x', () => {
    const x: WorldShape = { surfaces: [surfaceA], preset: 'login' };
    const result = worldShapeOverrideMonoid.combine(x, EMPTY_WORLD_SHAPE);
    expect(result).toEqual(x);
  });

  test('L-Right-Bias: b.surfaces (non-empty) wins over a.surfaces', () => {
    const a: WorldShape = { surfaces: [surfaceA] };
    const b: WorldShape = { surfaces: [surfaceB, surfaceC] };
    const result = worldShapeOverrideMonoid.combine(a, b);
    expect(result.surfaces).toEqual([surfaceB, surfaceC]);
  });

  test('L-Right-Bias-Fallthrough: b.surfaces empty → a.surfaces wins', () => {
    const a: WorldShape = { surfaces: [surfaceA] };
    const b: WorldShape = { surfaces: [] };
    const result = worldShapeOverrideMonoid.combine(a, b);
    expect(result.surfaces).toEqual([surfaceA]);
  });

  test('L-Right-Bias: b.preset wins over a.preset', () => {
    const a: WorldShape = { surfaces: [], preset: 'one' };
    const b: WorldShape = { surfaces: [], preset: 'two' };
    const result = worldShapeOverrideMonoid.combine(a, b);
    expect(result.preset).toBe('two');
  });

  test('L-Right-Bias-Fallthrough: b.preset undefined → a.preset wins', () => {
    const a: WorldShape = { surfaces: [], preset: 'one' };
    const b: WorldShape = { surfaces: [] };
    const result = worldShapeOverrideMonoid.combine(a, b);
    expect(result.preset).toBe('one');
  });

  test('L-Associativity: combine(a, combine(b, c)) ≡ combine(combine(a, b), c)', () => {
    const a: WorldShape = { surfaces: [surfaceA], preset: 'a-preset' };
    const b: WorldShape = { surfaces: [surfaceB] };
    const c: WorldShape = { surfaces: [surfaceC], preset: 'c-preset' };
    const left = worldShapeOverrideMonoid.combine(
      a,
      worldShapeOverrideMonoid.combine(b, c),
    );
    const right = worldShapeOverrideMonoid.combine(
      worldShapeOverrideMonoid.combine(a, b),
      c,
    );
    expect(left).toEqual(right);
  });
});

// ─── V: Cohort key Iso laws ─────────────────────────────────

describe('V — Cohort key Iso (cohortKey ⊣ parseCohortKey)', () => {
  const cohorts: readonly Cohort[] = [
    {
      kind: 'probe-surface',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    },
    {
      kind: 'probe-surface',
      cohort: { verb: 'navigate', facetKind: 'route', errorFamily: 'timeout' },
    },
    {
      kind: 'scenario-trajectory',
      scenarioId: 'scenario-1',
      topologyId: 'topology-A',
    },
    { kind: 'customer-compilation', corpus: 'resolvable' },
    { kind: 'customer-compilation', corpus: 'needs-human' },
  ];

  test('L-RoundTrip: parseCohortKey(cohortKey(c)) ≡ c for every variant', () => {
    for (const c of cohorts) {
      const key = cohortKey(c);
      const parsed = parseCohortKey(key);
      expect(parsed).toEqual(c);
    }
  });

  test('L-Parse-Returns-Null: malformed strings return null', () => {
    expect(parseCohortKey('garbage')).toBeNull();
    expect(parseCohortKey('probe-surface:malformed')).toBeNull();
    expect(parseCohortKey('scenario:no-topology')).toBeNull();
    expect(parseCohortKey('customer-compilation:corpus:invalid')).toBeNull();
    expect(parseCohortKey('')).toBeNull();
  });

  test('L-Key-Deterministic: same cohort yields same key across calls', () => {
    for (const c of cohorts) {
      expect(cohortKey(c)).toBe(cohortKey(c));
    }
  });

  test('L-Distinct-Cohorts-Distinct-Keys: different cohorts → different keys', () => {
    const keys = cohorts.map(cohortKey);
    expect(keys).toEqual([...new Set(keys)]);
  });
});
