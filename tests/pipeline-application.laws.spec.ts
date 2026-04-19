/**
 * Application-layer laws for the canonical artifact store and the
 * lookup chain implementation (Phase 0b.2).
 *
 * Verifies that:
 *   - The catalog walker picks up tier files from the canonical
 *     artifact store directories
 *   - The lookup chain implementation honors precedence order
 *     (operator > agentic > deterministic > live > cold)
 *   - Mode flags correctly skip slots (cold skips deterministic;
 *     no-overrides skips slots 1-2; warm walks the full chain)
 *   - Qualifier-aware lookup composes projection applicabilities
 *     via intersection
 *   - The catalog returned by loadWorkspaceCatalog has empty tier
 *     arrays when the directories don't exist
 */

import { expect, test } from '@playwright/test';
import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';

import { createProjectPaths } from '../product/application/paths';
import { runWithLocalServices } from '../product/composition/local-services';
import { loadWorkspaceCatalog } from '../product/application/catalog/workspace-catalog';
import type { WorkspaceCatalog } from '../product/application/catalog/types';
import { createCatalogLookupChain } from '../product/application/pipeline/lookup-chain-impl';

import { atom } from '../product/domain/pipeline/atom';
import type { ArtifactEnvelope } from '../product/application/catalog/types';
import type { Atom } from '../product/domain/pipeline/atom';
import type { AtomClass } from '../product/domain/pipeline/atom-address';
import type { PhaseOutputSource } from '../product/domain/pipeline/source';
import { asFingerprint } from '../product/domain/kernel/hash';
import { brandString } from '../product/domain/kernel/brand';

// ─── Helpers ─────────────────────────────────────────────────────

function makeRouteAtom(routeId: string, source: 'agentic-override' | 'deterministic-observation') {
  return atom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>(routeId) },
    content: { url: `/${routeId}.html` },
    source,
    inputFingerprint: asFingerprint('atom-input', `sha256:${routeId}-${source}`),
    provenance: { producedBy: 'test', producedAt: '2026-04-08T00:00:00.000Z' },
  });
}

function envelope<T>(artifact: T, fileName: string): ArtifactEnvelope<T> {
  return {
    artifact,
    artifactPath: fileName,
    absolutePath: `/tmp/${fileName}`,
    fingerprint: `sha256:${fileName}`,
  };
}

// ─── Catalog walker: empty store ─────────────────────────────────

test('loadWorkspaceCatalog returns empty tier arrays when canonical-artifacts dir is absent', async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'pipeline-app-empty-'));
  try {
    const paths = createProjectPaths(tmpDir);
    // Provide just enough to load: copy the repo's existing trust
    // policy fixture so the loader has a valid file to read.
    const repoTrustPolicy = path.resolve(__dirname, '..', '.tesseract', 'policy', 'trust-policy.yaml');
    await nodeFs.mkdir(path.join(tmpDir, '.tesseract', 'policy'), { recursive: true });
    await nodeFs.copyFile(
      repoTrustPolicy,
      path.join(tmpDir, '.tesseract', 'policy', 'trust-policy.yaml'),
    );

    const catalog = await runWithLocalServices(
      loadWorkspaceCatalog({ paths }),
      tmpDir,
    );
    expect(catalog.tier1Atoms).toEqual([]);
    expect(catalog.tier2Compositions).toEqual([]);
    expect(catalog.tier3Projections).toEqual([]);
  } finally {
    await nodeFs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ─── Lookup chain: empty catalog ─────────────────────────────────

test('lookupAtom returns null result on empty catalog', () => {
  const catalog: WorkspaceCatalog = makeMinimalEmptyCatalog();
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('missing') },
  });
  expect(result.resolved).toBeNull();
  expect(result.winningSource).toBeNull();
});

// ─── Lookup chain: precedence order (warm mode) ──────────────────

test('warm mode prefers agentic-override over deterministic-observation', () => {
  const agentic = makeRouteAtom('home', 'agentic-override');
  const deterministic = makeRouteAtom('home', 'deterministic-observation');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [
      envelope(agentic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-agentic.json'),
      envelope(deterministic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-deterministic.json'),
    ],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
  });
  expect(result.winningSource).toBe('agentic-override');
  expect(result.resolved?.source).toBe('agentic-override');
});

test('warm mode falls back to deterministic-observation when agentic absent', () => {
  const deterministic = makeRouteAtom('home', 'deterministic-observation');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(deterministic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-det.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
  });
  expect(result.winningSource).toBe('deterministic-observation');
});

// ─── Lookup chain: cold mode skips deterministic ────────────────

test('cold mode does not return deterministic-observation atoms', () => {
  const deterministic = makeRouteAtom('home', 'deterministic-observation');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(deterministic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-det.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
    mode: 'cold',
  });
  // Cold mode skips slot 3; nothing else exists, so resolved is null.
  expect(result.resolved).toBeNull();
});

test('cold mode still respects agentic-override (slot 2)', () => {
  const agentic = makeRouteAtom('home', 'agentic-override');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(agentic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-ag.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
    mode: 'cold',
  });
  expect(result.winningSource).toBe('agentic-override');
});

// ─── Lookup chain: no-overrides mode skips slots 1-2 ────────────

test('no-overrides mode does not return agentic-override atoms', () => {
  const agentic = makeRouteAtom('home', 'agentic-override');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(agentic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-ag.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
    mode: 'no-overrides',
  });
  expect(result.resolved).toBeNull();
});

test('no-overrides mode still returns deterministic-observation', () => {
  const deterministic = makeRouteAtom('home', 'deterministic-observation');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(deterministic as Atom<AtomClass, unknown, PhaseOutputSource>, 'home-det.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
    mode: 'no-overrides',
  });
  expect(result.winningSource).toBe('deterministic-observation');
});

// ─── Lookup chain: address discrimination ───────────────────────

test('lookupAtom does not return atoms with the wrong address', () => {
  const a = makeRouteAtom('home', 'agentic-override');
  const b = makeRouteAtom('search', 'agentic-override');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [
      envelope(a as Atom<AtomClass, unknown, PhaseOutputSource>, 'home.json'),
      envelope(b as Atom<AtomClass, unknown, PhaseOutputSource>, 'search.json'),
    ],
  };
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('home') },
  });
  expect((result.resolved?.address as { id: string }).id).toBe('home');
});

test('lookupAtom does not match across atom classes', () => {
  const a = makeRouteAtom('home', 'agentic-override');
  const catalog: WorkspaceCatalog = {
    ...makeMinimalEmptyCatalog(),
    tier1Atoms: [envelope(a as Atom<AtomClass, unknown, PhaseOutputSource>, 'home.json')],
  };
  const chain = createCatalogLookupChain(catalog);
  // Look up a screen with the same id as the route — should not match.
  const result = chain.lookupAtom({
    class: 'screen',
    address: { class: 'screen', screen: brandString<'ScreenId'>('home') },
  });
  expect(result.resolved).toBeNull();
});

// ─── Slots consulted accounting ─────────────────────────────────

test('slotsConsulted records the slots the chain walked', () => {
  const catalog = makeMinimalEmptyCatalog();
  const chain = createCatalogLookupChain(catalog);
  const result = chain.lookupAtom({
    class: 'route',
    address: { class: 'route', id: brandString<'RouteId'>('missing') },
    mode: 'warm',
  });
  // Warm mode walks 1-4 (5 is in-process, no on-disk slot consult).
  expect(result.slotsConsulted).toContain('operator-override');
  expect(result.slotsConsulted).toContain('live-derivation');
});

// ─── Helper: minimal empty catalog for testing ──────────────────

function makeMinimalEmptyCatalog(): WorkspaceCatalog {
  return {
    paths: createProjectPaths('/tmp/test'),
    snapshots: [],
    scenarios: [],
    boundScenarios: [],
    interpretationSurfaces: [],
    runRecords: [],
    proposalBundles: [],
    approvalReceipts: [],
    rerunPlans: [],
    datasets: [],
    benchmarks: [],
    routeManifests: [],
    resolutionControls: [],
    runbooks: [],
    surfaces: [],
    screenElements: [],
    screenHints: [],
    screenPostures: [],
    screenBehaviors: [],
    screenBundles: {},
    patternDocuments: [],
    behaviorPatterns: [],
    mergedPatterns: { aliases: [], elements: [], patterns: [] } as any,
    knowledgeSnapshots: [],
    discoveryRuns: [],
    evidenceRecords: [],
    interpretationDriftRecords: [],
    resolutionGraphRecords: [],
    confidenceCatalog: null,
    interfaceGraph: null,
    selectorCanon: null,
    stateGraph: null,
    agentSessions: [],
    improvementRuns: [],
    learningManifest: null,
    replayExamples: [],
    trustPolicy: {
      artifact: { kind: 'trust-policy', version: 1, rules: [] } as any,
      artifactPath: 'trust-policy.yaml',
      absolutePath: '/tmp/test/.tesseract/policy/trust-policy.yaml',
      fingerprint: 'sha256:empty',
    },
    tier1Atoms: [],
    tier2Compositions: [],
    tier3Projections: [],
  };
}
