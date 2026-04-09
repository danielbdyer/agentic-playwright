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
import {
  decomposeScreenHints,
  fingerprintableHintContent,
  type DecomposeScreenHintsInput,
} from '../lib/application/canon/decompose-screen-hints';
import type {
  ScreenElements,
  ElementSig,
  ScreenHints,
  ScreenElementHint,
} from '../lib/domain/knowledge/types';
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

// ════════════════════════════════════════════════════════════════
// decomposeScreenHints (Phase A.2)
// ════════════════════════════════════════════════════════════════

// ─── Hints fixture ───────────────────────────────────────────────

function makeHint(overrides: Partial<ScreenElementHint> = {}): ScreenElementHint {
  return {
    aliases: ['policy number', 'policy number field'],
    role: 'textbox',
    defaultValueRef: '{{activePolicy.number}}',
    parameter: 'policyNumber',
    affordance: 'text-entry',
    locatorLadder: undefined,
    snapshotAliases: undefined,
    source: undefined,
    epistemicStatus: undefined,
    activationPolicy: undefined,
    acquired: {
      certification: 'uncertified',
      activatedAt: '2026-04-03T05:17:33.241Z',
      certifiedAt: null,
      lineage: {
        runIds: ['2026-04-03T05-16-01-590Z'],
        evidenceIds: [],
        sourceArtifactPaths: ['controls/runbooks/synthetic-dogfood.runbook.yaml'],
        role: null,
        state: null,
        driftSeed: null,
      },
    },
    ...overrides,
  };
}

function makeScreenHints(
  overrides: Partial<Omit<ScreenHints, 'elements'>> = {},
  elements: Record<string, ScreenElementHint> = {
    policyNumberInput: makeHint(),
    searchButton: makeHint({ aliases: ['search', 'search button'], role: 'button' }),
    resultsTable: makeHint({ aliases: ['results table', 'search results'], role: 'table' }),
  },
): ScreenHints {
  return {
    screen: brandString<'ScreenId'>('policy-search'),
    screenAliases: ['policy search', 'policy search screen'],
    elements,
    ...overrides,
  };
}

function makeHintsInput(
  overrides: Partial<DecomposeScreenHintsInput> = {},
): DecomposeScreenHintsInput {
  return {
    content: makeScreenHints(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:screen-hints:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Determinism ─────────────────────────────────────────────────

test('decomposeScreenHints is deterministic for the same input', () => {
  const input = makeHintsInput();
  const left = decomposeScreenHints(input);
  const right = decomposeScreenHints(input);
  expect(left).toEqual(right);
  for (let i = 0; i < left.length; i += 1) {
    expect(left[i]?.inputFingerprint).toBe(right[i]?.inputFingerprint);
  }
});

// ─── Cardinality ─────────────────────────────────────────────────

test('decomposeScreenHints emits exactly one atom per element entry', () => {
  const input = makeHintsInput();
  const atoms = decomposeScreenHints(input);
  expect(atoms.length).toBe(Object.keys(input.content.elements).length);
});

test('decomposeScreenHints emits an empty array when elements is empty', () => {
  const input = makeHintsInput({ content: makeScreenHints({}, {}) });
  expect(decomposeScreenHints(input)).toEqual([]);
});

// ─── Address consistency ─────────────────────────────────────────

test('every emitted hint atom passes isAtomAddressConsistent', () => {
  const atoms = decomposeScreenHints(makeHintsInput());
  for (const a of atoms) {
    expect(isAtomAddressConsistent(a)).toBe(true);
    expect(a.class).toBe('element');
    expect(a.address.class).toBe('element');
  }
});

test('hint atoms share addressing with element atoms (same screen, same element ids)', () => {
  // The two decomposers must produce atoms with byte-equivalent
  // addresses for the same (screen, element) tuple. The future
  // lookup-chain join slice depends on this.
  const elementInputs = makeInput({
    content: makeScreenElements({}, {
      policyNumberInput: makeElementSig(),
    }),
  });
  const hintInputs = makeHintsInput({
    content: makeScreenHints({}, { policyNumberInput: makeHint() }),
  });
  const elementAtom = decomposeScreenElements(elementInputs)[0];
  const hintAtom = decomposeScreenHints(hintInputs)[0];
  expect(elementAtom).toBeDefined();
  expect(hintAtom).toBeDefined();
  expect(elementAtom?.address).toEqual(hintAtom?.address);
});

// ─── Source wiring ───────────────────────────────────────────────

test('decomposeScreenHints threads PhaseOutputSource through every atom', () => {
  const sources: readonly PhaseOutputSource[] = [
    'operator-override',
    'agentic-override',
    'deterministic-observation',
    'live-derivation',
    'cold-derivation',
  ];
  for (const source of sources) {
    const atoms = decomposeScreenHints(makeHintsInput({ source }));
    for (const a of atoms) {
      expect(a.source).toBe(source);
    }
  }
});

// ─── Content preservation ────────────────────────────────────────

test('hint atom content is byte-equivalent to the source ScreenElementHint (acquired included)', () => {
  const customHint = makeHint({
    aliases: ['choose status', 'pick status'],
    role: 'combobox',
    parameter: 'status',
  });
  const atoms = decomposeScreenHints(
    makeHintsInput({ content: makeScreenHints({}, { statusFilter: customHint }) }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content).toEqual(customHint);
  // Acquired must survive in the content even though it is excluded
  // from the fingerprint.
  expect(atoms[0]?.content.acquired).toBeDefined();
});

test('decomposeScreenHints does not mutate the source content', () => {
  const original = makeScreenHints();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposeScreenHints(makeHintsInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Stable ordering ─────────────────────────────────────────────

test('hint atom output is sorted lexicographically by element id regardless of input order', () => {
  const a = makeScreenHints({}, {
    zebra: makeHint(),
    apple: makeHint({ aliases: ['apple alias'] }),
    mango: makeHint({ aliases: ['mango alias'] }),
  });
  const b = makeScreenHints({}, {
    apple: makeHint({ aliases: ['apple alias'] }),
    mango: makeHint({ aliases: ['mango alias'] }),
    zebra: makeHint(),
  });
  const fromA = decomposeScreenHints(makeHintsInput({ content: a }));
  const fromB = decomposeScreenHints(makeHintsInput({ content: b }));
  const idsA = fromA.map((x) => x.address.element as string);
  const idsB = fromB.map((x) => x.address.element as string);
  expect(idsA).toEqual(['apple', 'mango', 'zebra']);
  expect(idsB).toEqual(['apple', 'mango', 'zebra']);
});

// ─── Fingerprint independence from provenance ───────────────────

test('hint inputFingerprint does not depend on producedAt / producedBy / pipelineVersion', () => {
  const baseline = decomposeScreenHints(makeHintsInput());
  const variants: ReadonlyArray<Partial<DecomposeScreenHintsInput>> = [
    { producedAt: '2030-12-31T23:59:59.999Z' },
    { producedBy: 'canon-decomposer:screen-hints:v9' },
    { pipelineVersion: 'sha-different' },
  ];
  for (const overrides of variants) {
    const variant = decomposeScreenHints(makeHintsInput(overrides));
    for (let i = 0; i < baseline.length; i += 1) {
      expect(baseline[i]?.inputFingerprint).toBe(variant[i]?.inputFingerprint);
    }
  }
});

// ─── Acquired exclusion (the hint-specific load-bearing property) ─

test('hint inputFingerprint does not depend on the acquired block', () => {
  // Two hints with identical user-meaningful content but different
  // activation lineage (different runIds, different timestamps,
  // different source paths). The fingerprint must be identical
  // because re-running the migration after a knowledge activation
  // cycle should not produce spurious "content changed" signals.
  const baseline = decomposeScreenHints(makeHintsInput());
  const reactivated = decomposeScreenHints(
    makeHintsInput({
      content: makeScreenHints({}, {
        policyNumberInput: makeHint({
          acquired: {
            certification: 'uncertified',
            activatedAt: '2030-01-01T00:00:00.000Z',
            certifiedAt: null,
            lineage: {
              runIds: ['2030-01-01T00-00-00-000Z'],
              evidenceIds: ['evidence-99'],
              sourceArtifactPaths: ['some/different/path.yaml'],
              role: null,
              state: null,
              driftSeed: null,
            },
          },
        }),
        searchButton: makeHint({ aliases: ['search', 'search button'], role: 'button' }),
        resultsTable: makeHint({ aliases: ['results table', 'search results'], role: 'table' }),
      }),
    }),
  );
  for (let i = 0; i < baseline.length; i += 1) {
    expect(baseline[i]?.inputFingerprint).toBe(reactivated[i]?.inputFingerprint);
  }
});

test('hint inputFingerprint changes when user-meaningful content changes', () => {
  const baseline = decomposeScreenHints(makeHintsInput());
  const mutated = decomposeScreenHints(
    makeHintsInput({
      content: makeScreenHints({}, {
        policyNumberInput: makeHint({ aliases: ['totally different aliases'] }),
        searchButton: makeHint({ aliases: ['search', 'search button'], role: 'button' }),
        resultsTable: makeHint({ aliases: ['results table', 'search results'], role: 'table' }),
      }),
    }),
  );
  const baselineMatch = baseline.find((a) => (a.address.element as string) === 'policyNumberInput');
  const mutatedMatch = mutated.find((a) => (a.address.element as string) === 'policyNumberInput');
  expect(baselineMatch?.inputFingerprint).not.toBe(mutatedMatch?.inputFingerprint);
});

// ─── fingerprintableHintContent helper ───────────────────────────

test('fingerprintableHintContent replaces acquired with null and preserves all other fields', () => {
  const hint = makeHint({
    aliases: ['x', 'y'],
    role: 'textbox',
    defaultValueRef: 'ref',
    parameter: 'p',
    affordance: 'text-entry',
  });
  const projected = fingerprintableHintContent(hint);
  expect(projected.acquired).toBeNull();
  expect(projected.aliases).toEqual(hint.aliases);
  expect(projected.role).toBe(hint.role);
  expect(projected.defaultValueRef).toBe(hint.defaultValueRef);
  expect(projected.parameter).toBe(hint.parameter);
  expect(projected.affordance).toBe(hint.affordance);
});

test('fingerprintableHintContent is deterministic', () => {
  const hint = makeHint();
  expect(fingerprintableHintContent(hint)).toEqual(fingerprintableHintContent(hint));
});

// ─── Provenance plumbing ─────────────────────────────────────────

test('hint provenance fields flow through to the atom envelope', () => {
  const atoms = decomposeScreenHints(
    makeHintsInput({
      producedBy: 'canon-decomposer:screen-hints:v9',
      producedAt: '2030-01-01T00:00:00.000Z',
      pipelineVersion: 'sha-cafebabe',
    }),
  );
  for (const a of atoms) {
    expect(a.provenance.producedBy).toBe('canon-decomposer:screen-hints:v9');
    expect(a.provenance.producedAt).toBe('2030-01-01T00:00:00.000Z');
    expect(a.provenance.pipelineVersion).toBe('sha-cafebabe');
    expect(a.provenance.inputs).toEqual(['screen-hints:policy-search']);
  }
});
