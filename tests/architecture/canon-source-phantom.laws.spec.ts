/**
 * Phase 0b: Canon Source Phantom Laws
 *
 * Asserts that the three canonical artifact types (Atom, Composition,
 * Projection) carry the `PhaseOutputSource` as a phantom type
 * parameter, letting functions constrain the source slots they
 * accept via narrow literal bounds.
 *
 * The canonical example of the safety guarantee: a promotion gate
 * that advances candidates from slot 5 (cold-derivation) to slot 3
 * (deterministic-observation) can reject anything that did not
 * originate at slot 4 or 5, at compile time.
 *
 * @see docs/envelope-axis-refactor-plan.md § 5 (Phase 0b)
 */
import { describe, test, expect } from 'vitest';
import type { Atom } from '../../lib/domain/pipeline/atom';
import { atom } from '../../lib/domain/pipeline/atom';
import type { Composition } from '../../lib/domain/pipeline/composition';
import { composition } from '../../lib/domain/pipeline/composition';
import type { Projection } from '../../lib/domain/pipeline/projection';
import { projection } from '../../lib/domain/pipeline/projection';
import type { PhaseOutputSource } from '../../lib/domain/pipeline/source';
import type { ElementAtomAddress } from '../../lib/domain/pipeline/atom-address';
import type { RouteGraphId } from '../../lib/domain/pipeline/composition-address';
import type { RoleId } from '../../lib/domain/pipeline/projection-address';
import type { CanonProvenance } from '../../lib/domain/pipeline/provenance';
import { createElementId, createScreenId } from '../../lib/domain/kernel/identity';

function makeProvenance(): CanonProvenance {
  return {
    producedBy: 'canon-source-phantom-test:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    inputs: [],
  };
}

function makeElementAddress(): ElementAtomAddress {
  return {
    class: 'element',
    screen: createScreenId('test-screen'),
    element: createElementId('test-element'),
  };
}

describe('Phase 0b: canon source phantom', () => {
  // ─── Law 1: atom() infers the narrow source literal ─────────

  test('Law 1: atom() returns Atom with inferred narrow source', () => {
    const result = atom({
      class: 'element',
      address: makeElementAddress(),
      content: { shape: 'minimal' },
      source: 'cold-derivation',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    // Type-level: the returned atom is Atom<'element', _, 'cold-derivation'>,
    // not Atom<'element', _, PhaseOutputSource>. The narrow literal
    // is inferred from the `source` field at construction time.
    type _NarrowSource = typeof result extends Atom<'element', unknown, 'cold-derivation'>
      ? true
      : false;
    const assertion: _NarrowSource = true;
    expect(assertion).toBe(true);
    expect(result.source).toBe('cold-derivation');
  });

  // ─── Law 2: Default parameter preserves back-compat ────────

  test('Law 2: Atom<C, T> single-arg form defaults to wide source union', () => {
    // Existing single-arg references continue to compile. A value
    // typed as `Atom<'element', X>` without a source parameter
    // resolves to `Atom<'element', X, PhaseOutputSource>`.
    type WideAtom = Atom<'element', { shape: 'minimal' }>;
    type _DefaultsToWide = WideAtom extends { source: PhaseOutputSource } ? true : false;
    const assertion: _DefaultsToWide = true;
    expect(assertion).toBe(true);
  });

  // ─── Law 3: Narrow source bound rejects wider sources ──────

  test('Law 3: a function bound to cold/live sources rejects operator-override atoms', () => {
    // A promotion gate that only accepts atoms from slots 4 or 5
    // (i.e., the discovery engine's own output).
    function acceptDiscoveredOnly<C extends 'element'>(
      _candidate: Atom<C, unknown, 'cold-derivation' | 'live-derivation'>,
    ): void {}

    const discovered = atom({
      class: 'element',
      address: makeElementAddress(),
      content: { shape: 'minimal' },
      source: 'cold-derivation',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    // This compiles: source is 'cold-derivation', within the bound.
    acceptDiscoveredOnly(discovered);

    const operatorOverride = atom({
      class: 'element',
      address: makeElementAddress(),
      content: { shape: 'minimal' },
      source: 'operator-override',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    // @ts-expect-error — source: 'operator-override' is not in the
    //   'cold-derivation' | 'live-derivation' bound. Removing the
    //   phantom source parameter would make this line compile,
    //   which is the regression signal.
    acceptDiscoveredOnly(operatorOverride);

    expect(discovered.source).toBe('cold-derivation');
    expect(operatorOverride.source).toBe('operator-override');
  });

  // ─── Law 4: composition() also narrows source ─────────────

  test('Law 4: composition() returns Composition with inferred narrow source', () => {
    const result = composition({
      subType: 'route-graph',
      address: { subType: 'route-graph', id: 'test-graph' as RouteGraphId },
      content: { app: 'test-app', baseUrl: '/test', variants: [] },
      atomReferences: [],
      source: 'agentic-override',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    type _NarrowSource = typeof result extends Composition<'route-graph', unknown, 'agentic-override'>
      ? true
      : false;
    const assertion: _NarrowSource = true;
    expect(assertion).toBe(true);
    expect(result.source).toBe('agentic-override');
  });

  // ─── Law 5: projection() also narrows source ──────────────

  test('Law 5: projection() returns Projection with inferred narrow source', () => {
    const result = projection({
      subType: 'role-visibility',
      address: { subType: 'role-visibility', role: 'admin' as RoleId },
      bindings: [],
      source: 'deterministic-observation',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    type _NarrowSource = typeof result extends Projection<'role-visibility', 'deterministic-observation'>
      ? true
      : false;
    const assertion: _NarrowSource = true;
    expect(assertion).toBe(true);
    expect(result.source).toBe('deterministic-observation');
  });

  // ─── Law 6: Cross-source assignment is rejected ──────────

  test('Law 6: cannot assign a cold-derivation atom where an operator-override atom is expected', () => {
    const coldAtom: Atom<'element', unknown, 'cold-derivation'> = atom({
      class: 'element',
      address: makeElementAddress(),
      content: { shape: 'minimal' },
      source: 'cold-derivation',
      inputFingerprint: 'sha256:test',
      provenance: makeProvenance(),
    });

    // @ts-expect-error — cross-source assignment: cold-derivation
    //   is not assignable to the 'operator-override' literal.
    const _operatorAtom: Atom<'element', unknown, 'operator-override'> = coldAtom;

    expect(coldAtom.source).toBe('cold-derivation');
  });
});
