/**
 * Laws for the canon namespace decomposers (Phase A of
 * `docs/cold-start-convergence-plan.md`).
 *
 * Verifies that `decomposeScreenElements` is a pure catamorphism
 * over `ScreenElements` that preserves the existing domain shape
 * (`ElementSig`) without inventing parallel content types — per
 * `docs/canon-and-derivation.md` § 16.7 and
 * `docs/domain-class-decomposition.md` § Target row, the atom
 * envelope stores existing domain types as content rather than
 * reinventing them.
 *
 * Properties asserted:
 *   - **Determinism**: same input → identical output (including
 *     `inputFingerprint`).
 *   - **Cardinality**: one atom per element entry in the source
 *     hybrid.
 *   - **Address consistency**: every emitted atom passes
 *     `isAtomAddressConsistent` (the `class` field equals
 *     `address.class`).
 *   - **Source wiring**: the requested `PhaseOutputSource` flows
 *     through to every emitted atom unchanged.
 *   - **Content preservation**: the `ElementSig` content survives
 *     decomposition byte-equivalent — the decomposer never
 *     mutates, augments, or reshapes the existing content.
 *   - **Stable ordering**: the output is ordered by element id
 *     (lexicographic) regardless of the input map's iteration
 *     order. Re-running the decomposer on the same content
 *     produces atoms in the same order.
 *   - **Fingerprint independence from provenance**: changing
 *     `producedAt` / `producedBy` / `pipelineVersion` does NOT
 *     change the per-atom `inputFingerprint`. This is the
 *     load-bearing property that lets the migration script
 *     re-run safely without triggering spurious promotion events.
 *   - **Empty input**: `{ elements: {} }` produces an empty array
 *     (catamorphism identity).
 */

import { expect, test } from '@playwright/test';

import {
  decomposeScreenElements,
  type DecomposeScreenElementsInput,
} from '../lib/application/canon/decompose-screen-elements';
import type { ScreenElements, ElementSig } from '../lib/domain/knowledge/types';
import { isAtomAddressConsistent } from '../lib/domain/pipeline/atom';
import type { PhaseOutputSource } from '../lib/domain/pipeline/source';
import { brandString } from '../lib/domain/kernel/brand';

// ─── Fixture ─────────────────────────────────────────────────────

function makeElementSig(overrides: Partial<ElementSig> = {}): ElementSig {
  return {
    role: 'textbox',
    name: 'Policy Number',
    testId: 'policy-number-input',
    surface: brandString<'SurfaceId'>('search-form'),
    widget: brandString<'WidgetId'>('os-input'),
    required: true,
    ...overrides,
  };
}

function makeScreenElements(
  overrides: Partial<Omit<ScreenElements, 'elements'>> = {},
  elements: Record<string, ElementSig> = {
    policyNumberInput: makeElementSig(),
    searchButton: makeElementSig({
      role: 'button',
      name: 'Search',
      testId: 'search-button',
      surface: brandString<'SurfaceId'>('search-actions'),
      widget: brandString<'WidgetId'>('os-button'),
    }),
    resultsTable: makeElementSig({
      role: 'table',
      name: 'Search Results',
      testId: 'search-results-table',
      surface: brandString<'SurfaceId'>('results-grid'),
      widget: brandString<'WidgetId'>('os-table'),
    }),
  },
): ScreenElements {
  return {
    screen: brandString<'ScreenId'>('policy-search'),
    url: '/policy-search.html',
    elements,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<DecomposeScreenElementsInput> = {},
): DecomposeScreenElementsInput {
  return {
    content: makeScreenElements(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:screen-elements:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Determinism ─────────────────────────────────────────────────

test('decomposeScreenElements is deterministic for the same input', () => {
  const input = makeInput();
  const left = decomposeScreenElements(input);
  const right = decomposeScreenElements(input);
  expect(left).toEqual(right);
  // Fingerprints must be identical too — not just structurally equal.
  for (let i = 0; i < left.length; i += 1) {
    expect(left[i]?.inputFingerprint).toBe(right[i]?.inputFingerprint);
  }
});

// ─── Cardinality ─────────────────────────────────────────────────

test('decomposeScreenElements emits exactly one atom per element entry', () => {
  const input = makeInput();
  const atoms = decomposeScreenElements(input);
  const sourceCount = Object.keys(input.content.elements).length;
  expect(atoms.length).toBe(sourceCount);
});

test('decomposeScreenElements emits an empty array for empty elements', () => {
  const input = makeInput({ content: makeScreenElements({}, {}) });
  const atoms = decomposeScreenElements(input);
  expect(atoms).toEqual([]);
});

// ─── Address consistency ─────────────────────────────────────────

test('every emitted atom passes isAtomAddressConsistent', () => {
  const atoms = decomposeScreenElements(makeInput());
  for (const a of atoms) {
    expect(isAtomAddressConsistent(a)).toBe(true);
    expect(a.class).toBe('element');
    expect(a.address.class).toBe('element');
  }
});

test('address.screen matches the source ScreenElements.screen', () => {
  const screen = brandString<'ScreenId'>('policy-detail');
  const atoms = decomposeScreenElements(
    makeInput({ content: makeScreenElements({ screen }) }),
  );
  for (const a of atoms) {
    expect(a.address.screen).toBe(screen);
  }
});

test('address.element matches the source map key', () => {
  const atoms = decomposeScreenElements(makeInput());
  const elementIds = atoms.map((a) => a.address.element as string);
  // Sorted lexicographic order is part of the contract; the input
  // had keys in insertion order { policyNumberInput, searchButton,
  // resultsTable }, the output should be sorted alphabetically.
  expect(elementIds).toEqual(['policyNumberInput', 'resultsTable', 'searchButton']);
});

// ─── Source wiring ───────────────────────────────────────────────

test('every emitted atom carries the requested PhaseOutputSource', () => {
  const sources: readonly PhaseOutputSource[] = [
    'operator-override',
    'agentic-override',
    'deterministic-observation',
    'live-derivation',
    'cold-derivation',
  ];
  for (const source of sources) {
    const atoms = decomposeScreenElements(makeInput({ source }));
    for (const a of atoms) {
      expect(a.source).toBe(source);
    }
  }
});

// ─── Content preservation ────────────────────────────────────────

test('atom content is byte-equivalent to the source ElementSig', () => {
  const customSig = makeElementSig({
    role: 'combobox',
    name: 'Status Filter',
    testId: 'status-filter',
    surface: brandString<'SurfaceId'>('filters'),
    widget: brandString<'WidgetId'>('os-select'),
    required: false,
  });
  const atoms = decomposeScreenElements(
    makeInput({
      content: makeScreenElements({}, { statusFilter: customSig }),
    }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content).toEqual(customSig);
});

test('decomposer does not mutate the source content', () => {
  const original = makeScreenElements();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposeScreenElements(makeInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Stable ordering ─────────────────────────────────────────────

test('output is sorted by element id regardless of input order', () => {
  // Two inputs with the same content but different insertion orders.
  const a = makeScreenElements({}, {
    zebra: makeElementSig(),
    apple: makeElementSig({ role: 'button' }),
    mango: makeElementSig({ role: 'table' }),
  });
  const b = makeScreenElements({}, {
    apple: makeElementSig({ role: 'button' }),
    mango: makeElementSig({ role: 'table' }),
    zebra: makeElementSig(),
  });
  const fromA = decomposeScreenElements(makeInput({ content: a }));
  const fromB = decomposeScreenElements(makeInput({ content: b }));
  const idsA = fromA.map((x) => x.address.element as string);
  const idsB = fromB.map((x) => x.address.element as string);
  expect(idsA).toEqual(['apple', 'mango', 'zebra']);
  expect(idsB).toEqual(['apple', 'mango', 'zebra']);
});

// ─── Fingerprint independence from provenance ───────────────────

test('inputFingerprint does not depend on producedAt', () => {
  const t1 = decomposeScreenElements(makeInput({ producedAt: '2026-04-09T00:00:00.000Z' }));
  const t2 = decomposeScreenElements(makeInput({ producedAt: '2026-12-31T23:59:59.999Z' }));
  for (let i = 0; i < t1.length; i += 1) {
    expect(t1[i]?.inputFingerprint).toBe(t2[i]?.inputFingerprint);
  }
});

test('inputFingerprint does not depend on producedBy', () => {
  const a = decomposeScreenElements(makeInput({ producedBy: 'canon-decomposer:v1' }));
  const b = decomposeScreenElements(makeInput({ producedBy: 'canon-decomposer:v2' }));
  for (let i = 0; i < a.length; i += 1) {
    expect(a[i]?.inputFingerprint).toBe(b[i]?.inputFingerprint);
  }
});

test('inputFingerprint does not depend on pipelineVersion', () => {
  const a = decomposeScreenElements(makeInput({ pipelineVersion: 'sha-aaa' }));
  const b = decomposeScreenElements(makeInput({ pipelineVersion: 'sha-bbb' }));
  for (let i = 0; i < a.length; i += 1) {
    expect(a[i]?.inputFingerprint).toBe(b[i]?.inputFingerprint);
  }
});

test('inputFingerprint changes when content changes', () => {
  const baseline = decomposeScreenElements(makeInput());
  const mutated = decomposeScreenElements(
    makeInput({
      content: makeScreenElements({}, {
        policyNumberInput: makeElementSig({ role: 'textbox', name: 'Different Name' }),
      }),
    }),
  );
  // Find the matching element in both runs (policyNumberInput); its
  // fingerprint must differ because the content differs.
  const baselineMatch = baseline.find(
    (a) => (a.address.element as string) === 'policyNumberInput',
  );
  const mutatedMatch = mutated.find(
    (a) => (a.address.element as string) === 'policyNumberInput',
  );
  expect(baselineMatch).toBeDefined();
  expect(mutatedMatch).toBeDefined();
  expect(baselineMatch?.inputFingerprint).not.toBe(mutatedMatch?.inputFingerprint);
});

// ─── Provenance plumbing ─────────────────────────────────────────

test('provenance fields flow through to the atom envelope', () => {
  const atoms = decomposeScreenElements(
    makeInput({
      producedBy: 'canon-decomposer:screen-elements:v9',
      producedAt: '2030-01-01T00:00:00.000Z',
      pipelineVersion: 'sha-deadbeef',
    }),
  );
  for (const a of atoms) {
    expect(a.provenance.producedBy).toBe('canon-decomposer:screen-elements:v9');
    expect(a.provenance.producedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(a.provenance.pipelineVersion).toBe('sha-deadbeef');
    expect(a.provenance.inputs).toEqual(['screen-elements:policy-search']);
  }
});
