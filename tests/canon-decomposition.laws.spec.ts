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
} from '../product/application/canon/decompose-screen-elements';
import {
  decomposeScreenHints,
  fingerprintableHintContent,
  type DecomposeScreenHintsInput,
} from '../product/application/canon/decompose-screen-hints';
import {
  decomposeScreenPostures,
  type DecomposeScreenPosturesInput,
} from '../product/application/canon/decompose-screen-postures';
import {
  decomposeRouteKnowledge,
  type DecomposeRouteKnowledgeInput,
  type RouteAtomContent,
} from '../product/application/canon/decompose-route-knowledge';
import {
  decomposeScreenSurfaces,
  type DecomposeScreenSurfacesInput,
  type SurfaceCompositionContent,
} from '../product/application/canon/decompose-screen-surfaces';
import {
  decomposePatterns,
  type DecomposePatternsInput,
  type PatternAtomContent,
} from '../product/application/canon/decompose-patterns';
import {
  decomposeSnapshots,
  type DecomposeSnapshotsInput,
  type SnapshotRecord,
  type SnapshotAtomContent,
} from '../product/application/canon/decompose-snapshots';
import type {
  ScreenElements,
  ElementSig,
  ScreenHints,
  ScreenElementHint,
  ScreenPostures,
  Posture,
  PostureEffect,
  SurfaceGraph,
  SurfaceDefinition,
  SurfaceSection,
  PatternDocument,
  PatternAliasSet,
} from '../product/domain/knowledge/types';
import type {
  RouteKnowledgeManifest,
  RouteKnowledgeRoute,
  RouteKnowledgeVariant,
} from '../product/domain/intent/routes';
import type { PhaseOutputSource } from '../product/domain/pipeline/source';
import { brandString } from '../product/domain/kernel/brand';

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

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

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

// ─── Content-sensitive fingerprint checks ─────────────────────

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

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('element atoms tag inputs with the screen-elements sentinel', () => {
  const atoms = decomposeScreenElements(makeInput());
  for (const a of atoms) {
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

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

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

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('hint atoms tag inputs with the screen-hints sentinel', () => {
  const atoms = decomposeScreenHints(makeHintsInput());
  for (const a of atoms) {
    expect(a.provenance.inputs).toEqual(['screen-hints:policy-search']);
  }
});

// ════════════════════════════════════════════════════════════════
// decomposeScreenPostures (Phase A.3)
// ════════════════════════════════════════════════════════════════

// ─── Posture fixture ─────────────────────────────────────────────

function makePostureEffect(overrides: Partial<PostureEffect> = {}): PostureEffect {
  return {
    target: brandString<'SurfaceId'>('validation-surface'),
    targetKind: 'surface',
    state: 'visible',
    message: '/no matching policy found/i',
    ...overrides,
  };
}

function makePosture(overrides: Partial<Posture> = {}): Posture {
  return {
    values: ['POL-001'],
    effects: [],
    ...overrides,
  };
}

function makeScreenPostures(
  overrides: Partial<Omit<ScreenPostures, 'postures'>> = {},
  postures: Record<string, Record<string, Posture>> = {
    policyNumberInput: {
      valid: makePosture({ values: ['POL-001'], effects: [] }),
      invalid: makePosture({
        values: ['NOTAPOLICY'],
        effects: [makePostureEffect()],
      }),
      empty: makePosture({ values: [''], effects: [] }),
    },
  },
): ScreenPostures {
  return {
    screen: brandString<'ScreenId'>('policy-search'),
    postures,
    ...overrides,
  };
}

function makePosturesInput(
  overrides: Partial<DecomposeScreenPosturesInput> = {},
): DecomposeScreenPosturesInput {
  return {
    content: makeScreenPostures(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:screen-postures:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Cardinality (nested map → flat atoms) ──────────────────────

test('decomposeScreenPostures emits one atom per (element, posture-name) pair', () => {
  const input = makePosturesInput();
  const atoms = decomposeScreenPostures(input);
  // Fixture has 1 element × 3 postures = 3 atoms.
  expect(atoms.length).toBe(3);
});

test('decomposeScreenPostures emits an empty array when postures map is empty', () => {
  const input = makePosturesInput({ content: makeScreenPostures({}, {}) });
  expect(decomposeScreenPostures(input)).toEqual([]);
});

test('decomposeScreenPostures emits an empty array when an element has no postures', () => {
  const input = makePosturesInput({
    content: makeScreenPostures({}, { policyNumberInput: {} }),
  });
  expect(decomposeScreenPostures(input)).toEqual([]);
});

test('decomposeScreenPostures handles multi-element input', () => {
  const input = makePosturesInput({
    content: makeScreenPostures({}, {
      policyNumberInput: {
        valid: makePosture(),
        invalid: makePosture(),
      },
      statusFilter: {
        valid: makePosture(),
        empty: makePosture(),
      },
    }),
  });
  const atoms = decomposeScreenPostures(input);
  // 2 elements × 2 postures each = 4 atoms.
  expect(atoms.length).toBe(4);
});

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

test('posture address carries screen, element, and posture identity', () => {
  const atoms = decomposeScreenPostures(makePosturesInput());
  const triples = atoms.map((a) => ({
    screen: a.address.screen,
    element: a.address.element as string,
    posture: a.address.posture as string,
  }));
  expect(triples).toEqual([
    { screen: 'policy-search', element: 'policyNumberInput', posture: 'empty' },
    { screen: 'policy-search', element: 'policyNumberInput', posture: 'invalid' },
    { screen: 'policy-search', element: 'policyNumberInput', posture: 'valid' },
  ]);
});

// ─── Content preservation ────────────────────────────────────────

test('posture atom content is byte-equivalent to the source Posture', () => {
  const customPosture = makePosture({
    values: ['ABC', 'XYZ'],
    effects: [
      makePostureEffect({ state: 'hidden', message: null }),
      makePostureEffect({
        target: brandString<'ElementId'>('somethingElse'),
        targetKind: 'element',
        state: 'disabled',
      }),
    ],
  });
  const atoms = decomposeScreenPostures(
    makePosturesInput({
      content: makeScreenPostures({}, {
        someElement: { boundary: customPosture },
      }),
    }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content).toEqual(customPosture);
});

test('decomposeScreenPostures does not mutate the source content', () => {
  const original = makeScreenPostures();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposeScreenPostures(makePosturesInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Stable ordering (outer and inner) ──────────────────────────

test('posture output is sorted by element id then by posture name', () => {
  // Shuffle both levels: insert elements in reverse order and
  // inner posture names in reverse order. The decomposer must
  // still produce the same lexicographic sequence.
  const shuffled = makeScreenPostures({}, {
    zebra: {
      valid: makePosture(),
      invalid: makePosture(),
      boundary: makePosture(),
    },
    apple: {
      valid: makePosture(),
      empty: makePosture(),
    },
    mango: {
      invalid: makePosture(),
      valid: makePosture(),
    },
  });
  const atoms = decomposeScreenPostures(makePosturesInput({ content: shuffled }));
  const sequence = atoms.map(
    (a) => `${a.address.element as string}/${a.address.posture as string}`,
  );
  expect(sequence).toEqual([
    'apple/empty',
    'apple/valid',
    'mango/invalid',
    'mango/valid',
    'zebra/boundary',
    'zebra/invalid',
    'zebra/valid',
  ]);
});

test('two inputs with the same content but different insertion orders produce identical output', () => {
  const a = makeScreenPostures({}, {
    apple: { valid: makePosture(), invalid: makePosture() },
    mango: { boundary: makePosture() },
  });
  const b = makeScreenPostures({}, {
    mango: { boundary: makePosture() },
    apple: { invalid: makePosture(), valid: makePosture() },
  });
  const fromA = decomposeScreenPostures(makePosturesInput({ content: a }));
  const fromB = decomposeScreenPostures(makePosturesInput({ content: b }));
  expect(fromA).toEqual(fromB);
});

// ─── Content-sensitive fingerprint checks ─────────────────────

test('posture inputFingerprint changes when effects change', () => {
  const baseline = decomposeScreenPostures(makePosturesInput());
  const mutated = decomposeScreenPostures(
    makePosturesInput({
      content: makeScreenPostures({}, {
        policyNumberInput: {
          valid: makePosture(),
          invalid: makePosture({
            effects: [makePostureEffect({ state: 'hidden' })],
          }),
          empty: makePosture({ values: [''], effects: [] }),
        },
      }),
    }),
  );
  const baselineInvalid = baseline.find((a) => (a.address.posture as string) === 'invalid');
  const mutatedInvalid = mutated.find((a) => (a.address.posture as string) === 'invalid');
  expect(baselineInvalid?.inputFingerprint).not.toBe(mutatedInvalid?.inputFingerprint);
});

test('posture inputFingerprint changes when values change', () => {
  const baseline = decomposeScreenPostures(makePosturesInput());
  const mutated = decomposeScreenPostures(
    makePosturesInput({
      content: makeScreenPostures({}, {
        policyNumberInput: {
          valid: makePosture({ values: ['DIFFERENT-VALUE'] }),
          invalid: makePosture({
            values: ['NOTAPOLICY'],
            effects: [makePostureEffect()],
          }),
          empty: makePosture({ values: [''], effects: [] }),
        },
      }),
    }),
  );
  const baselineValid = baseline.find((a) => (a.address.posture as string) === 'valid');
  const mutatedValid = mutated.find((a) => (a.address.posture as string) === 'valid');
  expect(baselineValid?.inputFingerprint).not.toBe(mutatedValid?.inputFingerprint);
});

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('posture atoms tag inputs with the screen-postures sentinel', () => {
  const atoms = decomposeScreenPostures(makePosturesInput());
  for (const a of atoms) {
    expect(a.provenance.inputs).toEqual(['screen-postures:policy-search']);
  }
});

// ════════════════════════════════════════════════════════════════
// decomposeRouteKnowledge (Phase A.4) — first tier-crossing
// ════════════════════════════════════════════════════════════════

// ─── Route knowledge fixture ─────────────────────────────────────

function makeVariant(
  id: string,
  overrides: Partial<RouteKnowledgeVariant> = {},
): RouteKnowledgeVariant {
  return {
    id: brandString<'RouteVariantId'>(id),
    url: `/fake.html?id=${id}`,
    screen: brandString<'ScreenId'>('policy-search'),
    pathTemplate: '/fake.html',
    query: { id },
    hash: null,
    tab: null,
    rootSelector: 'body',
    urlPattern: '/fake.html?id={id}',
    dimensions: ['query'],
    expectedEntryState: {
      requiredStateRefs: [],
      forbiddenStateRefs: [],
    },
    state: { id },
    mappedScreens: [brandString<'ScreenId'>('policy-search')],
    ...overrides,
  };
}

function makeRoute(
  id: string,
  overrides: Partial<RouteKnowledgeRoute> = {},
): RouteKnowledgeRoute {
  return {
    id: brandString<'RouteId'>(id),
    screen: brandString<'ScreenId'>(id),
    entryUrl: `/${id}.html`,
    rootSelector: 'body',
    variants: [makeVariant('default')],
    ...overrides,
  };
}

function makeManifest(
  overrides: Partial<RouteKnowledgeManifest> = {},
): RouteKnowledgeManifest {
  return {
    kind: 'route-knowledge',
    version: 1,
    governance: 'approved',
    app: 'demo',
    baseUrl: 'fixtures/synthetic-substrate',
    routes: [
      makeRoute('policy-search', {
        variants: [
          makeVariant('default', {
            url: '/policy-search.html',
            urlPattern: '/policy-search.html',
          }),
          makeVariant('results-with-policy', {
            url: '/policy-search.html?seed=POL-001',
            urlPattern: '/policy-search.html?seed={seed}',
            query: { seed: 'POL-001' },
            state: { seed: 'POL-001' },
          }),
        ],
      }),
      makeRoute('policy-detail', {
        variants: [makeVariant('with-policy')],
      }),
    ],
    ...overrides,
  };
}

function makeRouteInput(
  overrides: Partial<DecomposeRouteKnowledgeInput> = {},
): DecomposeRouteKnowledgeInput {
  return {
    content: makeManifest(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:route-knowledge:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Bag shape and cardinality ──────────────────────────────────

test('decomposeRouteKnowledge returns a typed bag with three fields', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  expect(Array.isArray(out.routeAtoms)).toBe(true);
  expect(Array.isArray(out.variantAtoms)).toBe(true);
  expect(Array.isArray(out.routeGraphs)).toBe(true);
});

test('route atom count equals manifest.routes.length', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  expect(out.routeAtoms.length).toBe(2);
});

test('variant atom count equals the sum of per-route variants', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  // fixture: policy-search has 2 variants, policy-detail has 1 = 3 total
  expect(out.variantAtoms.length).toBe(3);
});

test('route graph composition count is exactly one per manifest', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  expect(out.routeGraphs.length).toBe(1);
});

test('empty manifest.routes produces zero atoms but still one graph composition', () => {
  const out = decomposeRouteKnowledge(
    makeRouteInput({ content: makeManifest({ routes: [] }) }),
  );
  expect(out.routeAtoms).toEqual([]);
  expect(out.variantAtoms).toEqual([]);
  expect(out.routeGraphs.length).toBe(1);
  // The composition still exists because the manifest itself is a
  // canonical artifact even when it has zero routes — the app
  // metadata (app, baseUrl, governance) is still relevant.
  expect(out.routeGraphs[0]?.atomReferences).toEqual([]);
});

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

test('variant atom address carries (route, variant) tuple', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const tuples = out.variantAtoms.map((a) => ({
    route: a.address.route as string,
    variant: a.address.variant as string,
  }));
  expect(tuples).toEqual([
    { route: 'policy-detail', variant: 'with-policy' },
    { route: 'policy-search', variant: 'default' },
    { route: 'policy-search', variant: 'results-with-policy' },
  ]);
});

// ─── Content derivation: route atoms strip variants ─────────────

test('route atom content is the route minus the variants field', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const policySearchAtom = out.routeAtoms.find(
    (a) => (a.address.id as string) === 'policy-search',
  );
  expect(policySearchAtom).toBeDefined();
  const content: RouteAtomContent | undefined = policySearchAtom?.content;
  expect(content).toBeDefined();
  // All non-variants fields must be present.
  expect(content?.id as string).toBe('policy-search');
  expect(content?.screen as string).toBe('policy-search');
  expect(content?.entryUrl).toBe('/policy-search.html');
  expect(content?.rootSelector).toBe('body');
  // The variants field must not be present.
  expect('variants' in (content as object)).toBe(false);
});

// ─── Variant atom content is the variant verbatim ──────────────

test('variant atom content is byte-equivalent to the source variant', () => {
  const customVariant = makeVariant('custom', {
    url: '/custom.html?x=1',
    query: { x: '1' },
    tab: 'approve',
    dimensions: ['query', 'tab'],
  });
  const out = decomposeRouteKnowledge(
    makeRouteInput({
      content: makeManifest({
        routes: [makeRoute('r1', { variants: [customVariant] })],
      }),
    }),
  );
  expect(out.variantAtoms.length).toBe(1);
  expect(out.variantAtoms[0]?.content).toEqual(customVariant);
});

// ─── Composition shape ──────────────────────────────────────────

test('route graph composition address identifies the app', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const graph = out.routeGraphs[0];
  expect(graph).toBeDefined();
  expect(graph?.subType).toBe('route-graph');
  expect(graph?.address.subType).toBe('route-graph');
  expect(graph?.address.id as string).toBe('demo');
});

test('route graph composition content carries app, baseUrl, governance (not routes/kind/version)', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const graph = out.routeGraphs[0];
  expect(graph?.content.app).toBe('demo');
  expect(graph?.content.baseUrl).toBe('fixtures/synthetic-substrate');
  expect(graph?.content.governance).toBe('approved');
  // The composition content must NOT carry the routes array or the
  // addressing-level fields.
  expect('routes' in (graph?.content as object)).toBe(false);
  expect('kind' in (graph?.content as object)).toBe(false);
  expect('version' in (graph?.content as object)).toBe(false);
});

test('route graph composition atomReferences point to every route atom in sorted order', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const graph = out.routeGraphs[0];
  expect(graph).toBeDefined();
  expect(graph?.atomReferences.length).toBe(out.routeAtoms.length);
  for (let i = 0; i < out.routeAtoms.length; i += 1) {
    const ref = graph?.atomReferences[i];
    const routeAtom = out.routeAtoms[i];
    expect(ref?.address).toEqual(routeAtom?.address);
    expect(ref?.role).toBe('member');
    expect(ref?.order).toBe(i);
  }
});

test('route graph composition atomReferences do not list variant atoms', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const graph = out.routeGraphs[0];
  // Every reference must be a route atom address; no variant
  // addresses.
  for (const ref of graph?.atomReferences ?? []) {
    expect(ref.address.class).toBe('route');
  }
});

// ─── No source mutation ──────────────────────────────────────────

test('decomposeRouteKnowledge does not mutate the source manifest', () => {
  const original = makeManifest();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposeRouteKnowledge(makeRouteInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Stable ordering (outer + inner) ────────────────────────────

test('routes are sorted lexicographically by id regardless of manifest order', () => {
  const shuffled = makeManifest({
    routes: [
      makeRoute('zebra'),
      makeRoute('apple'),
      makeRoute('mango'),
    ],
  });
  const out = decomposeRouteKnowledge(makeRouteInput({ content: shuffled }));
  const ids = out.routeAtoms.map((a) => a.address.id as string);
  expect(ids).toEqual(['apple', 'mango', 'zebra']);
});

test('variants within a route are sorted lexicographically by id', () => {
  const manifest = makeManifest({
    routes: [
      makeRoute('route-a', {
        variants: [
          makeVariant('zz'),
          makeVariant('aa'),
          makeVariant('mm'),
        ],
      }),
    ],
  });
  const out = decomposeRouteKnowledge(makeRouteInput({ content: manifest }));
  const ids = out.variantAtoms.map((a) => a.address.variant as string);
  expect(ids).toEqual(['aa', 'mm', 'zz']);
});

// ─── Content-sensitive fingerprint checks (sibling isolation) ─

test('route atom fingerprint changes when route metadata changes (not variants)', () => {
  const baseline = decomposeRouteKnowledge(makeRouteInput());
  const mutated = decomposeRouteKnowledge(
    makeRouteInput({
      content: makeManifest({
        routes: [
          makeRoute('policy-search', {
            entryUrl: '/DIFFERENT.html',
            variants: [
              makeVariant('default', {
                url: '/policy-search.html',
                urlPattern: '/policy-search.html',
              }),
              makeVariant('results-with-policy', {
                url: '/policy-search.html?seed=POL-001',
                urlPattern: '/policy-search.html?seed={seed}',
                query: { seed: 'POL-001' },
                state: { seed: 'POL-001' },
              }),
            ],
          }),
          makeRoute('policy-detail', { variants: [makeVariant('with-policy')] }),
        ],
      }),
    }),
  );
  const baselineRoute = baseline.routeAtoms.find(
    (a) => (a.address.id as string) === 'policy-search',
  );
  const mutatedRoute = mutated.routeAtoms.find(
    (a) => (a.address.id as string) === 'policy-search',
  );
  expect(baselineRoute?.inputFingerprint).not.toBe(mutatedRoute?.inputFingerprint);
});

test('variant atom fingerprint changes when variant content changes (not its sibling route)', () => {
  const baseline = decomposeRouteKnowledge(makeRouteInput());
  const mutated = decomposeRouteKnowledge(
    makeRouteInput({
      content: makeManifest({
        routes: [
          makeRoute('policy-search', {
            variants: [
              makeVariant('default', {
                url: '/CHANGED.html',
                urlPattern: '/CHANGED.html',
              }),
              makeVariant('results-with-policy', {
                url: '/policy-search.html?seed=POL-001',
                urlPattern: '/policy-search.html?seed={seed}',
                query: { seed: 'POL-001' },
                state: { seed: 'POL-001' },
              }),
            ],
          }),
          makeRoute('policy-detail', { variants: [makeVariant('with-policy')] }),
        ],
      }),
    }),
  );
  const baselineDefault = baseline.variantAtoms.find(
    (a) =>
      (a.address.route as string) === 'policy-search' &&
      (a.address.variant as string) === 'default',
  );
  const mutatedDefault = mutated.variantAtoms.find(
    (a) =>
      (a.address.route as string) === 'policy-search' &&
      (a.address.variant as string) === 'default',
  );
  expect(baselineDefault?.inputFingerprint).not.toBe(mutatedDefault?.inputFingerprint);
  // The sibling variant's fingerprint must be unchanged.
  const baselineResults = baseline.variantAtoms.find(
    (a) =>
      (a.address.route as string) === 'policy-search' &&
      (a.address.variant as string) === 'results-with-policy',
  );
  const mutatedResults = mutated.variantAtoms.find(
    (a) =>
      (a.address.route as string) === 'policy-search' &&
      (a.address.variant as string) === 'results-with-policy',
  );
  expect(baselineResults?.inputFingerprint).toBe(mutatedResults?.inputFingerprint);
});

test('composition fingerprint changes when route atom set changes', () => {
  const baseline = decomposeRouteKnowledge(makeRouteInput());
  const mutated = decomposeRouteKnowledge(
    makeRouteInput({
      content: makeManifest({
        routes: [
          makeRoute('policy-search'),
          makeRoute('policy-detail'),
          makeRoute('policy-amendment'), // one more route
        ],
      }),
    }),
  );
  expect(baseline.routeGraphs[0]?.inputFingerprint).not.toBe(
    mutated.routeGraphs[0]?.inputFingerprint,
  );
});

test('composition fingerprint changes when app metadata changes', () => {
  const baseline = decomposeRouteKnowledge(makeRouteInput());
  const mutated = decomposeRouteKnowledge(
    makeRouteInput({
      content: makeManifest({ app: 'different-app' }),
    }),
  );
  expect(baseline.routeGraphs[0]?.inputFingerprint).not.toBe(
    mutated.routeGraphs[0]?.inputFingerprint,
  );
});

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('route atoms, variants, and graph tag inputs with the route-knowledge sentinels', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  // Route atoms: single manifest-level tag.
  for (const a of out.routeAtoms) {
    expect(a.provenance.inputs).toEqual(['route-knowledge:demo']);
  }
  // Variants: dual-input (manifest + parent route) — the demotion
  // cascade needs to mark variants as candidates when EITHER
  // upstream changes.
  for (const a of out.variantAtoms) {
    expect(a.provenance.inputs?.[0]).toBe('route-knowledge:demo');
    expect(a.provenance.inputs?.[1]).toBe(
      `route-knowledge:demo:${a.address.route as string}`,
    );
  }
  // Route graph composition: manifest-level tag.
  for (const g of out.routeGraphs) {
    expect(g.provenance.inputs).toEqual(['route-knowledge:demo']);
  }
});

// ─── Cross-tier invariant: composition references are byte-equal to the atoms' addresses ─

test('every composition atomReference.address is byte-equal to the corresponding routeAtom.address', () => {
  const out = decomposeRouteKnowledge(makeRouteInput());
  const graph = out.routeGraphs[0];
  for (const ref of graph?.atomReferences ?? []) {
    const matchingAtom = out.routeAtoms.find(
      (a) => JSON.stringify(a.address) === JSON.stringify(ref.address),
    );
    expect(matchingAtom).toBeDefined();
  }
});


// ════════════════════════════════════════════════════════════════
// decomposeScreenSurfaces (Phase A.5) — second tier-crossing
// ════════════════════════════════════════════════════════════════

// ─── Surface graph fixture ───────────────────────────────────────

function makeSurfaceDefinition(
  overrides: Partial<SurfaceDefinition> = {},
): SurfaceDefinition {
  return {
    kind: 'form',
    section: brandString<'SectionId'>('search-form'),
    selector: '#search-form',
    parents: [],
    children: [],
    elements: [brandString<'ElementId'>('policyNumberInput')],
    assertions: ['state'],
    required: true,
    ...overrides,
  };
}

function makeSurfaceSection(
  overrides: Partial<SurfaceSection> = {},
): SurfaceSection {
  return {
    selector: '#search-form',
    kind: 'form',
    surfaces: [brandString<'SurfaceId'>('search-form')],
    ...overrides,
  };
}

function makeSurfaceGraph(
  overrides: Partial<Omit<SurfaceGraph, 'surfaces' | 'sections'>> = {},
  sections: Record<string, SurfaceSection> = {
    'search-form': makeSurfaceSection({
      surfaces: [
        brandString<'SurfaceId'>('search-form'),
        brandString<'SurfaceId'>('search-actions'),
        brandString<'SurfaceId'>('validation-surface'),
      ],
    }),
  },
  surfaces: Record<string, SurfaceDefinition> = {
    'search-form': makeSurfaceDefinition({
      children: [
        brandString<'SurfaceId'>('search-actions'),
        brandString<'SurfaceId'>('validation-surface'),
      ],
    }),
    'search-actions': makeSurfaceDefinition({
      kind: 'action-cluster',
      selector: '[data-testid="search-button"]',
      parents: [brandString<'SurfaceId'>('search-form')],
      children: [],
      elements: [brandString<'ElementId'>('searchButton')],
    }),
    'validation-surface': makeSurfaceDefinition({
      kind: 'validation-region',
      selector: '[data-testid="validation-summary"]',
      parents: [brandString<'SurfaceId'>('search-form')],
      children: [],
      elements: [brandString<'ElementId'>('validationSummary')],
      required: false,
    }),
  },
): SurfaceGraph {
  return {
    screen: brandString<'ScreenId'>('policy-search'),
    url: '/policy-search.html',
    sections,
    surfaces,
    ...overrides,
  };
}

function makeSurfacesInput(
  overrides: Partial<DecomposeScreenSurfacesInput> = {},
): DecomposeScreenSurfacesInput {
  return {
    content: makeSurfaceGraph(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:screen-surfaces:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Bag shape ──────────────────────────────────────────────────

test('decomposeScreenSurfaces returns a typed bag with two fields (atoms + compositions)', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  expect(Array.isArray(out.surfaceAtoms)).toBe(true);
  expect(Array.isArray(out.surfaceCompositions)).toBe(true);
});

// ─── Cardinality ─────────────────────────────────────────────────

test('surface atom count equals the number of entries in surfaces map', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  expect(out.surfaceAtoms.length).toBe(3);
});

test('surface composition count is exactly one per surface graph', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  expect(out.surfaceCompositions.length).toBe(1);
});

test('empty surfaces map produces zero atoms but still one composition', () => {
  const out = decomposeScreenSurfaces(
    makeSurfacesInput({ content: makeSurfaceGraph({}, {}, {}) }),
  );
  expect(out.surfaceAtoms).toEqual([]);
  expect(out.surfaceCompositions.length).toBe(1);
  expect(out.surfaceCompositions[0]?.atomReferences).toEqual([]);
});

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

test('surface atom address carries (screen, surface-id) tuple', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  const tuples = out.surfaceAtoms.map((a) => ({
    screen: a.address.screen as string,
    surface: a.address.surface as string,
  }));
  expect(tuples).toEqual([
    { screen: 'policy-search', surface: 'search-actions' },
    { screen: 'policy-search', surface: 'search-form' },
    { screen: 'policy-search', surface: 'validation-surface' },
  ]);
});

// ─── Content preservation ────────────────────────────────────────

test('surface atom content is byte-equivalent to the source SurfaceDefinition', () => {
  const customDef = makeSurfaceDefinition({
    kind: 'dialog',
    selector: '[role="dialog"]',
    assertions: ['state', 'structure'],
    required: false,
  });
  const out = decomposeScreenSurfaces(
    makeSurfacesInput({
      content: makeSurfaceGraph({}, {}, { 'custom-dialog': customDef }),
    }),
  );
  expect(out.surfaceAtoms.length).toBe(1);
  expect(out.surfaceAtoms[0]?.content).toEqual(customDef);
});

test('decomposeScreenSurfaces does not mutate the source graph', () => {
  const original = makeSurfaceGraph();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposeScreenSurfaces(makeSurfacesInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Composition content derivation ─────────────────────────────

test('composition content carries screen, url, and sections (no surfaces field)', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  const comp = out.surfaceCompositions[0];
  expect(comp).toBeDefined();
  expect(comp?.content.screen as string).toBe('policy-search');
  expect(comp?.content.url).toBe('/policy-search.html');
  expect(comp?.content.sections).toBeDefined();
  // The surfaces field must NOT be present in the composition
  // content — surfaces are split out into Tier 1 atoms.
  expect('surfaces' in (comp?.content as object)).toBe(false);
});

test('composition address identifies (screen, default)', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  const comp = out.surfaceCompositions[0];
  expect(comp?.subType).toBe('surface-composition');
  expect(comp?.address.subType).toBe('surface-composition');
  expect(comp?.address.screen as string).toBe('policy-search');
  expect(comp?.address.id as string).toBe('default');
});

test('composition sections carry all original entries verbatim', () => {
  const customSection = makeSurfaceSection({
    selector: '#custom',
    url: '/policy-search.html?custom=1',
    kind: 'result-set',
    surfaces: [brandString<'SurfaceId'>('results-grid')],
  });
  const out = decomposeScreenSurfaces(
    makeSurfacesInput({
      content: makeSurfaceGraph(
        {},
        { 'custom-section': customSection },
        { 'results-grid': makeSurfaceDefinition({ kind: 'result-set' }) },
      ),
    }),
  );
  const comp = out.surfaceCompositions[0];
  expect(comp?.content.sections['custom-section']).toEqual(customSection);
});

// ─── Composition atom references ────────────────────────────────

test('composition atomReferences list every surface atom in sorted order', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  const comp = out.surfaceCompositions[0];
  expect(comp?.atomReferences.length).toBe(out.surfaceAtoms.length);
  for (let i = 0; i < out.surfaceAtoms.length; i += 1) {
    const ref = comp?.atomReferences[i];
    const atom = out.surfaceAtoms[i];
    expect(ref?.address).toEqual(atom?.address);
    expect(ref?.role).toBe('member');
    expect(ref?.order).toBe(i);
  }
});

test('every composition atomReference address is byte-equal to the corresponding surface atom address', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  const comp = out.surfaceCompositions[0];
  for (const ref of comp?.atomReferences ?? []) {
    const matchingAtom = out.surfaceAtoms.find(
      (a) => JSON.stringify(a.address) === JSON.stringify(ref.address),
    );
    expect(matchingAtom).toBeDefined();
  }
});

// ─── Stable ordering ─────────────────────────────────────────────

test('surface atoms are sorted lexicographically by surface id regardless of input order', () => {
  const shuffled = makeSurfaceGraph(
    {},
    {},
    {
      zebra: makeSurfaceDefinition(),
      apple: makeSurfaceDefinition({ kind: 'action-cluster' }),
      mango: makeSurfaceDefinition({ kind: 'result-set' }),
    },
  );
  const out = decomposeScreenSurfaces(makeSurfacesInput({ content: shuffled }));
  const ids = out.surfaceAtoms.map((a) => a.address.surface as string);
  expect(ids).toEqual(['apple', 'mango', 'zebra']);
});

test('two inputs with the same content but different insertion orders produce identical output', () => {
  const a = makeSurfaceGraph(
    {},
    {
      apple: makeSurfaceSection(),
      zebra: makeSurfaceSection({ kind: 'result-set' }),
    },
    {
      b: makeSurfaceDefinition({ kind: 'form' }),
      a: makeSurfaceDefinition({ kind: 'action-cluster' }),
    },
  );
  const b = makeSurfaceGraph(
    {},
    {
      zebra: makeSurfaceSection({ kind: 'result-set' }),
      apple: makeSurfaceSection(),
    },
    {
      a: makeSurfaceDefinition({ kind: 'action-cluster' }),
      b: makeSurfaceDefinition({ kind: 'form' }),
    },
  );
  const fromA = decomposeScreenSurfaces(makeSurfacesInput({ content: a }));
  const fromB = decomposeScreenSurfaces(makeSurfacesInput({ content: b }));
  expect(fromA).toEqual(fromB);
});

// ─── Content-sensitive fingerprint checks (sibling isolation) ─

test('surface atom fingerprint changes when definition changes (sibling isolation)', () => {
  const baseline = decomposeScreenSurfaces(makeSurfacesInput());
  const mutated = decomposeScreenSurfaces(
    makeSurfacesInput({
      content: makeSurfaceGraph(
        {},
        {
          'search-form': makeSurfaceSection({
            surfaces: [
              brandString<'SurfaceId'>('search-form'),
              brandString<'SurfaceId'>('search-actions'),
              brandString<'SurfaceId'>('validation-surface'),
            ],
          }),
        },
        {
          'search-form': makeSurfaceDefinition({
            selector: '#DIFFERENT-selector',
            children: [
              brandString<'SurfaceId'>('search-actions'),
              brandString<'SurfaceId'>('validation-surface'),
            ],
          }),
          'search-actions': makeSurfaceDefinition({
            kind: 'action-cluster',
            selector: '[data-testid="search-button"]',
            parents: [brandString<'SurfaceId'>('search-form')],
            elements: [brandString<'ElementId'>('searchButton')],
          }),
          'validation-surface': makeSurfaceDefinition({
            kind: 'validation-region',
            selector: '[data-testid="validation-summary"]',
            parents: [brandString<'SurfaceId'>('search-form')],
            elements: [brandString<'ElementId'>('validationSummary')],
            required: false,
          }),
        },
      ),
    }),
  );
  const baselineSearch = baseline.surfaceAtoms.find(
    (a) => (a.address.surface as string) === 'search-form',
  );
  const mutatedSearch = mutated.surfaceAtoms.find(
    (a) => (a.address.surface as string) === 'search-form',
  );
  expect(baselineSearch?.inputFingerprint).not.toBe(mutatedSearch?.inputFingerprint);
  // Sibling isolation: mutating search-form must not change the
  // search-actions or validation-surface fingerprints.
  const baselineActions = baseline.surfaceAtoms.find(
    (a) => (a.address.surface as string) === 'search-actions',
  );
  const mutatedActions = mutated.surfaceAtoms.find(
    (a) => (a.address.surface as string) === 'search-actions',
  );
  expect(baselineActions?.inputFingerprint).toBe(mutatedActions?.inputFingerprint);
});

test('composition fingerprint changes when sections change', () => {
  const baseline = decomposeScreenSurfaces(makeSurfacesInput());
  const mutated = decomposeScreenSurfaces(
    makeSurfacesInput({
      content: makeSurfaceGraph(
        {},
        {
          'search-form': makeSurfaceSection({
            selector: '#completely-different',
            surfaces: [
              brandString<'SurfaceId'>('search-form'),
              brandString<'SurfaceId'>('search-actions'),
              brandString<'SurfaceId'>('validation-surface'),
            ],
          }),
        },
      ),
    }),
  );
  expect(baseline.surfaceCompositions[0]?.inputFingerprint).not.toBe(
    mutated.surfaceCompositions[0]?.inputFingerprint,
  );
});

test('composition fingerprint changes when surface atom set changes', () => {
  const baseline = decomposeScreenSurfaces(makeSurfacesInput());
  const mutated = decomposeScreenSurfaces(
    makeSurfacesInput({
      content: makeSurfaceGraph(
        {},
        {},
        {
          // Remove validation-surface, keep the other two.
          'search-form': makeSurfaceDefinition({
            children: [brandString<'SurfaceId'>('search-actions')],
          }),
          'search-actions': makeSurfaceDefinition({
            kind: 'action-cluster',
            parents: [brandString<'SurfaceId'>('search-form')],
          }),
        },
      ),
    }),
  );
  expect(baseline.surfaceCompositions[0]?.inputFingerprint).not.toBe(
    mutated.surfaceCompositions[0]?.inputFingerprint,
  );
});

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('surface atoms and composition tag inputs with the screen-surfaces sentinel', () => {
  const out = decomposeScreenSurfaces(makeSurfacesInput());
  for (const a of out.surfaceAtoms) {
    expect(a.provenance.inputs).toEqual(['screen-surfaces:policy-search']);
  }
  for (const c of out.surfaceCompositions) {
    expect(c.provenance.inputs).toEqual(['screen-surfaces:policy-search']);
  }
});

// ════════════════════════════════════════════════════════════════
// decomposePatterns (Phase A.6) — two-sub-map flatten
// ════════════════════════════════════════════════════════════════

// ─── Pattern fixture ─────────────────────────────────────────────

function makeAliasSet(id: string, aliases: readonly string[]): PatternAliasSet {
  return { id, aliases };
}

function makePatternDocument(
  overrides: Partial<PatternDocument> = {},
): PatternDocument {
  return {
    version: 1,
    actions: {
      click: makeAliasSet('core.click', ['press', 'tap', 'select']),
      input: makeAliasSet('core.input', ['enter', 'type', 'fill']),
      navigate: makeAliasSet('core.navigate', ['go to', 'open', 'visit']),
    },
    postures: {
      valid: makeAliasSet('core.valid', ['valid', 'correct', 'proper']),
      invalid: makeAliasSet('core.invalid', ['invalid', 'incorrect', 'wrong']),
      empty: makeAliasSet('core.empty', ['empty', 'blank', 'cleared']),
    },
    ...overrides,
  };
}

function makePatternsInput(
  overrides: Partial<DecomposePatternsInput> = {},
): DecomposePatternsInput {
  return {
    content: makePatternDocument(),
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:patterns:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Cardinality (both sub-maps flattened) ──────────────────────

test('decomposePatterns emits one atom per actions entry plus one per postures entry', () => {
  const atoms = decomposePatterns(makePatternsInput());
  // Fixture: 3 actions + 3 postures = 6 atoms.
  expect(atoms.length).toBe(6);
});

test('decomposePatterns emits an empty array when both sub-maps are empty', () => {
  const atoms = decomposePatterns(
    makePatternsInput({
      content: { version: 1, actions: {}, postures: {} },
    }),
  );
  expect(atoms).toEqual([]);
});

test('decomposePatterns handles an undefined actions sub-map', () => {
  const atoms = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        postures: { valid: makeAliasSet('p.valid', ['ok']) },
      },
    }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content.category).toBe('posture');
});

test('decomposePatterns handles an undefined postures sub-map', () => {
  const atoms = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        actions: { click: makeAliasSet('a.click', ['press']) },
      },
    }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content.category).toBe('action');
});

test('decomposePatterns handles both sub-maps being undefined', () => {
  const atoms = decomposePatterns(
    makePatternsInput({ content: { version: 1 } }),
  );
  expect(atoms).toEqual([]);
});

// ─── Category tagging ────────────────────────────────────────────

test('atoms from the actions sub-map carry category: action', () => {
  const atoms = decomposePatterns(makePatternsInput());
  const actionAtoms = atoms.filter((a) => a.content.category === 'action');
  const actionIds = actionAtoms.map((a) => a.content.id);
  expect(actionIds.sort()).toEqual(['core.click', 'core.input', 'core.navigate']);
});

test('atoms from the postures sub-map carry category: posture', () => {
  const atoms = decomposePatterns(makePatternsInput());
  const postureAtoms = atoms.filter((a) => a.content.category === 'posture');
  const postureIds = postureAtoms.map((a) => a.content.id);
  expect(postureIds.sort()).toEqual(['core.empty', 'core.invalid', 'core.valid']);
});

// ─── Address shape (mint invariants covered by canon-minting.laws) ─

test('pattern atom address.id equals content.id (the PatternAliasSet id field)', () => {
  const atoms = decomposePatterns(makePatternsInput());
  for (const a of atoms) {
    expect(a.address.id).toBe(a.content.id);
  }
});

// ─── Content preservation (aliases survive verbatim) ────────────

test('pattern atom content preserves the source PatternAliasSet aliases byte-equivalent', () => {
  const customAliases = ['custom-1', 'custom-2', 'custom-3'];
  const atoms = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        actions: {
          click: makeAliasSet('custom.click', customAliases),
        },
        postures: {},
      },
    }),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content.aliases).toEqual(customAliases);
});

test('decomposePatterns does not mutate the source document', () => {
  const original = makePatternDocument();
  const snapshot = JSON.parse(JSON.stringify(original));
  decomposePatterns(makePatternsInput({ content: original }));
  expect(original).toEqual(snapshot);
});

// ─── Stable ordering (by id across both sub-maps) ───────────────

test('pattern atoms are sorted lexicographically by id regardless of sub-map origin', () => {
  const atoms = decomposePatterns(makePatternsInput());
  const ids = atoms.map((a) => a.content.id);
  // Mixed action + posture ids in lexicographic order.
  expect(ids).toEqual([
    'core.click',
    'core.empty',
    'core.input',
    'core.invalid',
    'core.navigate',
    'core.valid',
  ]);
});

test('two inputs with the same content but different insertion orders produce identical output', () => {
  const a: PatternDocument = {
    version: 1,
    actions: {
      navigate: makeAliasSet('core.navigate', ['go to']),
      click: makeAliasSet('core.click', ['press']),
      input: makeAliasSet('core.input', ['type']),
    },
    postures: {
      invalid: makeAliasSet('core.invalid', ['wrong']),
      valid: makeAliasSet('core.valid', ['ok']),
      empty: makeAliasSet('core.empty', ['blank']),
    },
  };
  const b: PatternDocument = {
    version: 1,
    actions: {
      click: makeAliasSet('core.click', ['press']),
      input: makeAliasSet('core.input', ['type']),
      navigate: makeAliasSet('core.navigate', ['go to']),
    },
    postures: {
      empty: makeAliasSet('core.empty', ['blank']),
      invalid: makeAliasSet('core.invalid', ['wrong']),
      valid: makeAliasSet('core.valid', ['ok']),
    },
  };
  const fromA = decomposePatterns(makePatternsInput({ content: a }));
  const fromB = decomposePatterns(makePatternsInput({ content: b }));
  expect(fromA).toEqual(fromB);
});

// ─── Content-sensitive fingerprint checks (sibling isolation) ─

test('pattern atom fingerprint changes when aliases change (sibling isolation)', () => {
  const baseline = decomposePatterns(makePatternsInput());
  const mutated = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        actions: {
          click: makeAliasSet('core.click', ['completely', 'different', 'aliases']),
          input: makeAliasSet('core.input', ['enter', 'type', 'fill']),
          navigate: makeAliasSet('core.navigate', ['go to', 'open', 'visit']),
        },
        postures: {
          valid: makeAliasSet('core.valid', ['valid', 'correct', 'proper']),
          invalid: makeAliasSet('core.invalid', ['invalid', 'incorrect', 'wrong']),
          empty: makeAliasSet('core.empty', ['empty', 'blank', 'cleared']),
        },
      },
    }),
  );
  const baselineClick = baseline.find((a) => a.content.id === 'core.click');
  const mutatedClick = mutated.find((a) => a.content.id === 'core.click');
  expect(baselineClick?.inputFingerprint).not.toBe(mutatedClick?.inputFingerprint);
  // Sibling isolation: mutating core.click must not change
  // core.input's fingerprint.
  const baselineInput = baseline.find((a) => a.content.id === 'core.input');
  const mutatedInput = mutated.find((a) => a.content.id === 'core.input');
  expect(baselineInput?.inputFingerprint).toBe(mutatedInput?.inputFingerprint);
});

// ─── Category is part of the fingerprint ────────────────────────

test('pattern atom fingerprint encodes the category (action vs posture)', () => {
  // Two atoms with the SAME id and the SAME aliases but different
  // categories must produce different fingerprints. This is the
  // load-bearing property that makes the category extension of
  // PatternAliasSet meaningful for the promotion gate.
  const asAction = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        actions: {
          click: makeAliasSet('shared.thing', ['do it']),
        },
        postures: {},
      },
    }),
  );
  const asPosture = decomposePatterns(
    makePatternsInput({
      content: {
        version: 1,
        actions: {},
        postures: {
          thing: makeAliasSet('shared.thing', ['do it']),
        },
      },
    }),
  );
  expect(asAction[0]?.inputFingerprint).not.toBe(asPosture[0]?.inputFingerprint);
  expect(asAction[0]?.content.category).toBe('action');
  expect(asPosture[0]?.content.category).toBe('posture');
});

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('pattern atoms tag inputs with the shared-patterns sentinel', () => {
  const atoms = decomposePatterns(makePatternsInput());
  for (const a of atoms) {
    expect(a.provenance.inputs).toEqual(['patterns:shared']);
  }
});

// ════════════════════════════════════════════════════════════════
// decomposeSnapshots (Phase A.7) — first collection-based decomposer
// ════════════════════════════════════════════════════════════════

// ─── Snapshot fixtures ───────────────────────────────────────────

function makeAriaTree(role: string, name: string): unknown {
  return {
    role,
    name,
    children: [
      {
        role: 'rowgroup',
        children: [
          {
            role: 'row',
            children: [{ role: 'cell', name: 'POL-001' }],
          },
        ],
      },
    ],
  };
}

function makeSnapshotRecord(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    id: brandString<'SnapshotTemplateId'>('policy-search/results-with-policy'),
    screen: brandString<'ScreenId'>('policy-search'),
    snapshotHash:
      '866d8e42c03724d2d08429a09dbf221dfc0461a4fb1d0ddcb620edf1a0c8f2bf',
    tree: makeAriaTree('table', 'Search Results'),
    ...overrides,
  };
}

function makeSnapshotsInput(
  overrides: Partial<DecomposeSnapshotsInput> = {},
  records: readonly SnapshotRecord[] = [
    makeSnapshotRecord(),
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('policy-detail/with-claims'),
      screen: brandString<'ScreenId'>('policy-detail'),
      snapshotHash: 'deadbeefcafe0000',
      tree: makeAriaTree('list', 'Claims List'),
    }),
  ],
): DecomposeSnapshotsInput {
  return {
    content: records,
    source: 'agentic-override' as PhaseOutputSource,
    producedBy: 'canon-decomposer:snapshots:v1',
    producedAt: '2026-04-09T00:00:00.000Z',
    pipelineVersion: 'sha-test',
    ...overrides,
  };
}

// ─── Cardinality ─────────────────────────────────────────────────

test('decomposeSnapshots emits one atom per input record', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  expect(atoms.length).toBe(2);
});

test('decomposeSnapshots emits an empty array when content is empty', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput({}, []));
  expect(atoms).toEqual([]);
});

test('decomposeSnapshots handles a single-record batch', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput({}, [makeSnapshotRecord()]));
  expect(atoms.length).toBe(1);
});

// ─── Address consistency (shape only — mint invariants covered by canon-minting.laws) ─

test('snapshot atom address.id equals the record id (path-based)', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  // Fixture order after lex sort: policy-detail/with-claims
  // before policy-search/results-with-policy.
  expect(atoms[0]?.address.id as string).toBe('policy-detail/with-claims');
  expect(atoms[1]?.address.id as string).toBe(
    'policy-search/results-with-policy',
  );
});

// ─── Content shape ───────────────────────────────────────────────

test('snapshot atom content carries screen, snapshotHash, and tree', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  for (const a of atoms) {
    expect(a.content.screen).toBeDefined();
    expect(typeof a.content.snapshotHash).toBe('string');
    expect(a.content.tree).toBeDefined();
  }
});

test('snapshot atom content.tree is byte-equivalent to the source record.tree', () => {
  const customTree = { role: 'custom', children: [{ role: 'nested', name: 'thing' }] };
  const atoms = decomposeSnapshots(
    makeSnapshotsInput({}, [
      makeSnapshotRecord({ tree: customTree }),
    ]),
  );
  expect(atoms.length).toBe(1);
  expect(atoms[0]?.content.tree).toEqual(customTree);
});

test('snapshot atom content.screen matches the source record.screen', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  const byId = new Map(atoms.map((a) => [a.address.id as string, a]));
  expect((byId.get('policy-detail/with-claims')?.content.screen as string)).toBe(
    'policy-detail',
  );
  expect(
    (byId.get('policy-search/results-with-policy')?.content.screen as string),
  ).toBe('policy-search');
});

test('snapshot atom content.snapshotHash matches the source record.snapshotHash', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  const byId = new Map(atoms.map((a) => [a.address.id as string, a]));
  expect(byId.get('policy-detail/with-claims')?.content.snapshotHash).toBe(
    'deadbeefcafe0000',
  );
  expect(
    byId.get('policy-search/results-with-policy')?.content.snapshotHash,
  ).toBe('866d8e42c03724d2d08429a09dbf221dfc0461a4fb1d0ddcb620edf1a0c8f2bf');
});

test('decomposeSnapshots does not mutate the source records', () => {
  const records = [makeSnapshotRecord()];
  const snapshot = JSON.parse(JSON.stringify(records));
  decomposeSnapshots(makeSnapshotsInput({}, records));
  expect(records).toEqual(snapshot);
});

// ─── Stable ordering ─────────────────────────────────────────────

test('snapshot atoms are sorted lexicographically by id regardless of input order', () => {
  const records: readonly SnapshotRecord[] = [
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('zebra/z'),
      screen: brandString<'ScreenId'>('zebra'),
      snapshotHash: 'zzz',
      tree: { role: 'generic' },
    }),
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('apple/a'),
      screen: brandString<'ScreenId'>('apple'),
      snapshotHash: 'aaa',
      tree: { role: 'generic' },
    }),
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('mango/m'),
      screen: brandString<'ScreenId'>('mango'),
      snapshotHash: 'mmm',
      tree: { role: 'generic' },
    }),
  ];
  const atoms = decomposeSnapshots(makeSnapshotsInput({}, records));
  const ids = atoms.map((a) => a.address.id as string);
  expect(ids).toEqual(['apple/a', 'mango/m', 'zebra/z']);
});

test('two invocations with the same records in different orders produce identical output', () => {
  const a: readonly SnapshotRecord[] = [
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('b'),
      screen: brandString<'ScreenId'>('s'),
      snapshotHash: 'bbb',
      tree: { role: 'a' },
    }),
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('a'),
      screen: brandString<'ScreenId'>('s'),
      snapshotHash: 'aaa',
      tree: { role: 'a' },
    }),
  ];
  const b: readonly SnapshotRecord[] = [
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('a'),
      screen: brandString<'ScreenId'>('s'),
      snapshotHash: 'aaa',
      tree: { role: 'a' },
    }),
    makeSnapshotRecord({
      id: brandString<'SnapshotTemplateId'>('b'),
      screen: brandString<'ScreenId'>('s'),
      snapshotHash: 'bbb',
      tree: { role: 'a' },
    }),
  ];
  const fromA = decomposeSnapshots(makeSnapshotsInput({}, a));
  const fromB = decomposeSnapshots(makeSnapshotsInput({}, b));
  expect(fromA).toEqual(fromB);
});

// ─── Content-sensitive fingerprint checks (sibling isolation) ─

test('snapshot atom fingerprint changes when the tree changes (sibling isolation)', () => {
  const baseline = decomposeSnapshots(makeSnapshotsInput());
  const mutated = decomposeSnapshots(
    makeSnapshotsInput({}, [
      makeSnapshotRecord(), // unchanged
      makeSnapshotRecord({
        id: brandString<'SnapshotTemplateId'>('policy-detail/with-claims'),
        screen: brandString<'ScreenId'>('policy-detail'),
        snapshotHash: 'deadbeefcafe0000',
        tree: makeAriaTree('list', 'COMPLETELY-DIFFERENT'),
      }),
    ]),
  );
  const baselineDetail = baseline.find(
    (a) => (a.address.id as string) === 'policy-detail/with-claims',
  );
  const mutatedDetail = mutated.find(
    (a) => (a.address.id as string) === 'policy-detail/with-claims',
  );
  expect(baselineDetail?.inputFingerprint).not.toBe(mutatedDetail?.inputFingerprint);
  // Sibling isolation: mutating policy-detail must not change the
  // policy-search atom's fingerprint.
  const baselineSearch = baseline.find(
    (a) => (a.address.id as string) === 'policy-search/results-with-policy',
  );
  const mutatedSearch = mutated.find(
    (a) => (a.address.id as string) === 'policy-search/results-with-policy',
  );
  expect(baselineSearch?.inputFingerprint).toBe(mutatedSearch?.inputFingerprint);
});

test('snapshot atom fingerprint changes when snapshotHash changes (hash is part of content)', () => {
  const baseline = decomposeSnapshots(makeSnapshotsInput({}, [makeSnapshotRecord()]));
  const mutated = decomposeSnapshots(
    makeSnapshotsInput({}, [
      makeSnapshotRecord({ snapshotHash: 'different-hash-value' }),
    ]),
  );
  expect(baseline[0]?.inputFingerprint).not.toBe(mutated[0]?.inputFingerprint);
});

// ─── Per-decomposer inputs tagging ──────────────────────────────

test('each snapshot atom tags inputs with its own template id', () => {
  const atoms = decomposeSnapshots(makeSnapshotsInput());
  for (const a of atoms) {
    expect(a.provenance.inputs).toEqual([`snapshot:${a.address.id as string}`]);
  }
});
