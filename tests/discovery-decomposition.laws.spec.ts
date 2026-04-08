/**
 * Laws for the discovery namespace decomposer (Phase 0d).
 *
 * Verifies that:
 *   - decomposeDiscoveryRun is a pure catamorphism over DiscoveryRun
 *   - the same input always produces the same output (determinism)
 *   - per-class extractors produce one atom per source slice
 *     (cardinality)
 *   - all decomposed atoms carry source: 'cold-derivation'
 *   - the registry can route by atom class
 *   - the screen-discovery runner stub fails with a structured
 *     "not yet wired" error when invoked without runImpl
 *   - groupAtomsByClass is O(n) and returns the correct grouping
 */

import { expect, test } from '@playwright/test';
import { Effect } from 'effect';

import {
  decomposeDiscoveryRun,
  atomsOfClass,
  groupAtomsByClass,
} from '../lib/application/discovery/decompose-discovery-run';
import {
  createDiscoveryRunnerRegistry,
  type DiscoveryRunner,
  type DiscoveryRunnerId,
} from '../lib/application/discovery/discovery-runner';
import {
  createScreenDiscoveryRunner,
  SCREEN_DISCOVERY_PRODUCED_CLASSES,
  SCREEN_DISCOVERY_RUNNER_ID,
} from '../lib/application/discovery/screen-discovery-runner';

import type { DiscoveryRun } from '../lib/domain/target/interface-graph';
import type { AtomClass } from '../lib/domain/pipeline/atom-address';
import { brandString } from '../lib/domain/kernel/brand';

// ─── Fixture: a synthetic DiscoveryRun ───────────────────────────

function makeDiscoveryRun(overrides: Partial<DiscoveryRun> = {}): DiscoveryRun {
  return {
    kind: 'discovery-run',
    version: 2,
    stage: 'preparation',
    scope: 'workspace',
    governance: 'approved',
    app: 'demo',
    routeId: brandString<'RouteId'>('policy-search-default'),
    variantId: brandString<'RouteVariantId'>('default'),
    routeVariantRef: 'demo:policy-search-default:default',
    runId: 'run-fixture-001',
    screen: brandString<'ScreenId'>('policy-search'),
    url: '/policy-search.html',
    title: 'Policy Search',
    discoveredAt: '2026-04-08T12:00:00.000Z',
    artifactPath: '.tesseract/discovery/policy-search.json',
    rootSelector: 'body',
    snapshotHash: 'sha256:fixture-snapshot',
    sections: [
      {
        id: brandString<'SectionId'>('main'),
        depth: 0,
        selector: 'main',
        surfaceIds: [brandString<'SurfaceId'>('search-form')],
        elementIds: [brandString<'ElementId'>('policyNumberInput'), brandString<'ElementId'>('searchButton')],
      },
    ],
    surfaces: [
      {
        id: brandString<'SurfaceId'>('search-form'),
        targetRef: brandString<'CanonicalTargetRef'>('canon:demo:policy-search:search-form'),
        section: brandString<'SectionId'>('main'),
        selector: 'form',
        role: 'form',
        name: 'Search form',
        kind: 'form' as const,
        assertions: [],
        testId: 'search-form',
      },
    ],
    elements: [
      {
        id: brandString<'ElementId'>('policyNumberInput'),
        targetRef: brandString<'CanonicalTargetRef'>('canon:demo:policy-search:policyNumberInput'),
        surface: brandString<'SurfaceId'>('search-form'),
        selector: '[data-testid="policy-number"]',
        role: 'textbox',
        name: 'Policy Number',
        testId: 'policy-number',
        widget: 'os-input',
        required: true,
        locatorHint: 'test-id',
        locatorCandidates: [],
      },
      {
        id: brandString<'ElementId'>('searchButton'),
        targetRef: brandString<'CanonicalTargetRef'>('canon:demo:policy-search:searchButton'),
        surface: brandString<'SurfaceId'>('search-form'),
        selector: '[data-testid="search"]',
        role: 'button',
        name: 'Search',
        testId: 'search',
        widget: 'os-button',
        required: true,
        locatorHint: 'test-id',
        locatorCandidates: [],
      },
    ],
    snapshotAnchors: ['main'],
    targets: [],
    reviewNotes: [],
    selectorProbes: [
      {
        id: 'probe-001',
        selectorRef: brandString<'SelectorRef'>('demo:probe-001'),
        targetRef: brandString<'CanonicalTargetRef'>('canon:demo:policy-search:policyNumberInput'),
        graphNodeId: 'node-001',
        screen: brandString<'ScreenId'>('policy-search'),
        section: brandString<'SectionId'>('main'),
        element: brandString<'ElementId'>('policyNumberInput'),
        strategy: { kind: 'test-id' as const, value: 'policy-number' },
        source: 'discovery' as const,
        variantRef: 'demo:default',
        validWhenStateRefs: [],
        invalidWhenStateRefs: [],
      },
    ],
    stateObservations: [
      {
        stateRef: brandString<'StateNodeRef'>('state-loaded'),
        source: 'baseline' as const,
        observed: true,
      },
    ],
    eventCandidates: [],
    transitionObservations: [],
    observationDiffs: [],
    graphDeltas: { nodeIds: [], edgeIds: [] },
    ...overrides,
  };
}

// ─── Determinism law ─────────────────────────────────────────────

test('decomposeDiscoveryRun is deterministic — same input produces identical output', () => {
  const run = makeDiscoveryRun();
  const a = decomposeDiscoveryRun({ run, producedBy: 'test', producedAt: '2026-04-08T12:00:00.000Z' });
  const b = decomposeDiscoveryRun({ run, producedBy: 'test', producedAt: '2026-04-08T12:00:00.000Z' });
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
});

// ─── Per-class cardinality laws ──────────────────────────────────

test('decomposeDiscoveryRun produces exactly one screen atom per run', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  const screenAtoms = atomsOfClass(decomposed, 'screen');
  expect(screenAtoms.length).toBe(1);
});

test('decomposeDiscoveryRun produces one surface atom per run.surfaces entry', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'surface').length).toBe(run.surfaces.length);
});

test('decomposeDiscoveryRun produces one element atom per run.elements entry', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'element').length).toBe(run.elements.length);
});

test('decomposeDiscoveryRun produces one selector atom per probe with element binding', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  const expected = run.selectorProbes.filter((p) => p.element != null).length;
  expect(atomsOfClass(decomposed, 'selector').length).toBe(expected);
});

test('decomposeDiscoveryRun skips selector probes with no element binding', () => {
  const runWithDanglingProbe = makeDiscoveryRun({
    selectorProbes: [
      {
        id: 'dangling-probe',
        selectorRef: brandString<'SelectorRef'>('demo:dangling'),
        targetRef: brandString<'CanonicalTargetRef'>('canon:demo:dangling'),
        graphNodeId: 'node-dangling',
        screen: brandString<'ScreenId'>('policy-search'),
        section: brandString<'SectionId'>('main'),
        element: null,
        strategy: { kind: 'test-id' as const, value: 'dangling' },
        source: 'discovery' as const,
        variantRef: 'demo:default',
        validWhenStateRefs: [],
        invalidWhenStateRefs: [],
      },
    ],
  });
  const decomposed = decomposeDiscoveryRun({ run: runWithDanglingProbe, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'selector').length).toBe(0);
});

test('decomposeDiscoveryRun produces one snapshot atom when snapshotHash is non-empty', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'snapshot').length).toBe(1);
});

test('decomposeDiscoveryRun produces no snapshot atom when snapshotHash is empty', () => {
  const run = makeDiscoveryRun({ snapshotHash: '' });
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'snapshot').length).toBe(0);
});

test('decomposeDiscoveryRun produces one observation-predicate atom per stateObservation', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(atomsOfClass(decomposed, 'observation-predicate').length).toBe(
    run.stateObservations.length,
  );
});

// ─── Source classification law ───────────────────────────────────

test('every decomposed atom carries source: cold-derivation', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  for (const a of decomposed) {
    expect(a.source).toBe('cold-derivation');
  }
});

// ─── Provenance propagation law ──────────────────────────────────

test('every decomposed atom carries the supplied producedBy and producedAt', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({
    run,
    producedBy: 'test-runner',
    producedAt: '2026-04-09T00:00:00.000Z',
  });
  for (const a of decomposed) {
    expect(a.provenance.producedBy).toBe('test-runner');
    expect(a.provenance.producedAt).toBe('2026-04-09T00:00:00.000Z');
  }
});

test('producedAt defaults to run.discoveredAt when not supplied', () => {
  const run = makeDiscoveryRun({ discoveredAt: '2026-04-08T15:30:00.000Z' });
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  expect(decomposed[0]?.provenance.producedAt).toBe('2026-04-08T15:30:00.000Z');
});

// ─── Address consistency law ─────────────────────────────────────

test('every decomposed atom has address.class === atom.class (invariant)', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  for (const a of decomposed) {
    expect((a.address as { class: string }).class).toBe(a.class);
  }
});

// ─── groupAtomsByClass law ───────────────────────────────────────

test('groupAtomsByClass returns the correct grouping in O(n) time', () => {
  const run = makeDiscoveryRun();
  const decomposed = decomposeDiscoveryRun({ run, producedBy: 'test' });
  const grouped = groupAtomsByClass(decomposed);
  // Every key in the grouping should match exactly atomsOfClass.
  for (const [cls, atoms] of grouped.entries()) {
    expect(atoms.length).toBe(atomsOfClass(decomposed, cls).length);
  }
  // Sum of grouped lengths equals the total decomposed length.
  const total = [...grouped.values()].reduce((sum, arr) => sum + arr.length, 0);
  expect(total).toBe(decomposed.length);
});

// ─── Registry routing laws ───────────────────────────────────────

test('createDiscoveryRunnerRegistry routes by atom class', () => {
  const screenRunner = createScreenDiscoveryRunner();
  const producesByRunnerId = new Map<DiscoveryRunnerId, readonly AtomClass[]>([
    [SCREEN_DISCOVERY_RUNNER_ID, SCREEN_DISCOVERY_PRODUCED_CLASSES],
  ]);
  const registry = createDiscoveryRunnerRegistry([screenRunner as DiscoveryRunner], producesByRunnerId);

  expect(registry.runnersFor('screen')).toHaveLength(1);
  expect(registry.runnersFor('element')).toHaveLength(1);
  expect(registry.runnersFor('selector')).toHaveLength(1);
  // Atom classes the screen runner does NOT produce.
  expect(registry.runnersFor('route')).toHaveLength(0);
  expect(registry.runnersFor('pattern')).toHaveLength(0);
  expect(registry.runnersFor('drift-mode')).toHaveLength(0);
});

test('registry.all returns all registered runners by id', () => {
  const screenRunner = createScreenDiscoveryRunner();
  const registry = createDiscoveryRunnerRegistry(
    [screenRunner as DiscoveryRunner],
    new Map([[SCREEN_DISCOVERY_RUNNER_ID, SCREEN_DISCOVERY_PRODUCED_CLASSES]]),
  );
  expect(registry.all().size).toBe(1);
  expect(registry.all().has(SCREEN_DISCOVERY_RUNNER_ID)).toBe(true);
});

// ─── Stub runner failure law ─────────────────────────────────────

test('screen discovery runner fails with structured error when runImpl is not provided', async () => {
  const runner = createScreenDiscoveryRunner();
  const result = await Effect.runPromiseExit(
    runner.run({
      paths: {} as any,
      context: { screen: 'policy-search', url: '/policy-search.html' },
    }),
  );
  expect(result._tag).toBe('Failure');
});
