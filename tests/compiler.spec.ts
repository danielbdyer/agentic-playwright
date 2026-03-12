import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { emitOperatorInbox } from '../lib/application/inbox';
import { describeScenarioPaths } from '../lib/application/inspect';
import { emitScenario } from '../lib/application/emit';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { emitManifestPath } from '../lib/application/paths';
import { resolveAgentSessionAdapter } from '../lib/application/provider-registry';
import { refreshScenario } from '../lib/application/refresh';
import { runScenario } from '../lib/application/run';
import { replayInterpretation } from '../lib/application/replay-interpretation';
import { inspectSurface } from '../lib/application/surface';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { inspectWorkflow } from '../lib/application/workflow';
import type { ProjectionCacheMissIncremental, ProjectionIncremental } from '../lib/application/projections/runner';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createAdoId, createElementId, createScreenId, createSurfaceId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { harvestDeclaredRoutes } from '../lib/infrastructure/tooling/harvest-routes';
import { createTestWorkspace } from './support/workspace';

const policySearchScreenId = createScreenId('policy-search');
const policyNumberInputId = createElementId('policyNumberInput');
const searchButtonId = createElementId('searchButton');
const resultsTableId = createElementId('resultsTable');
const resultsGridId = createSurfaceId('results-grid');
const searchFormId = createSurfaceId('search-form');

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function projectPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function incrementalKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function expectCacheMiss(incremental: ProjectionIncremental): ProjectionCacheMissIncremental {
  expect(incremental.status).toBe('cache-miss');
  if (incremental.status !== 'cache-miss') {
    throw new Error(`Expected cache-miss incremental result, received ${incremental.status}`);
  }
  return incremental;
}

test('refresh recompiles the seeded scenario through graph, types, and program emission', async () => {
  const workspace = createTestWorkspace('compiler-refresh');
  try {
    const adoId = createAdoId('10001');
    const result = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const generated = readFileSync(result.compile.emitted.outputPath, 'utf8').replace(/^\uFEFF/, '');
    const traceArtifact = JSON.parse(readFileSync(result.compile.emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(result.compile.emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    const graph = JSON.parse(readFileSync(result.compile.graph.graphPath, 'utf8').replace(/^\uFEFF/, ''));

    expect(result.sync.snapshots).toHaveLength(1);
    expect(result.compile.bound.hasUnbound).toBeFalsy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.confidence === 'intent-only')).toBeTruthy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.binding.kind === 'deferred')).toBeTruthy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.binding.governance === 'approved')).toBeTruthy();
    expect(projectPath(result.compile.compileSnapshot.taskPath)).toContain('.tesseract/tasks/10001.resolution.json');
    expect(generated).toContain('runScenarioHandshake');
    expect(generated).toContain('createLocalRuntimeEnvironment');
    expect(generated).toContain('workflow.step');
    expect(generated).toContain('intent-only');
    expect(generated).toContain('deferred-steps');
    expect(traceArtifact.steps[1].runtime.status).toBe('pending');
    expect(traceArtifact.steps[1].provenanceKind).toBe('unresolved');
    expect(traceArtifact.summary.provenanceKinds.unresolved).toBe(4);
    expect(traceArtifact.summary.unresolvedReasons).toEqual([{ reason: 'runtime-resolution-required', count: 4 }]);
    expect(traceArtifact.governance).toBe('approved');
    expect(traceArtifact.steps[0].normalizedIntent).toContain('navigate');
    expect(review).toContain('# Verify policy search returns matching policy');
    expect(review).toContain('## Bottlenecks');
    expect(review).toContain('Preparation lane: scenario -> bound envelope -> task packet');
    expect(review).toContain('Binding kind: deferred');
    expect(review).toContain('## Step 1');
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.surface(policySearchScreenId, resultsGridId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.screenHints(policySearchScreenId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.pattern('core.input'))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedTrace(adoId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedReview(adoId))).toBeTruthy();
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.provenanceKind).toBe('unresolved');
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.runtimeStatus).toBe('pending');
    expect(projectPath(result.compile.generatedTypes.outputPath)).toContain('lib/generated/tesseract-knowledge.ts');
  } finally {
    workspace.cleanup();
  }
});

test('paths identifies surface, graph, generated review, and supplement artifacts for the seeded scenario', async () => {
  const workspace = createTestWorkspace('compiler-paths');
  try {
    const result = await runWithLocalServices(
      describeScenarioPaths({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(projectPath(result.artifacts.snapshot)).toContain('.ado-sync/snapshots/10001.json');
    expect(projectPath(result.artifacts.scenario)).toContain('scenarios/demo/policy-search/10001.scenario.yaml');
    expect(projectPath(result.artifacts.bound)).toContain('.tesseract/bound/10001.json');
    expect(projectPath(result.artifacts.task)).toContain('.tesseract/tasks/10001.resolution.json');
    expect(projectPath(result.artifacts.graph)).toContain('.tesseract/graph/index.json');
    expect(projectPath(result.artifacts.interfaceGraph)).toContain('.tesseract/interface/index.json');
    expect(projectPath(result.artifacts.selectorCanon)).toContain('.tesseract/interface/selectors.json');
    expect(projectPath(result.artifacts.trace)).toContain('generated/demo/policy-search/10001.trace.json');
    expect(projectPath(result.artifacts.review)).toContain('generated/demo/policy-search/10001.review.md');
    expect(projectPath(result.artifacts.learningManifest)).toContain('.tesseract/learning/manifest.json');
    expect(projectPath(result.artifacts.trustPolicy)).toContain('.tesseract/policy/trust-policy.yaml');
    expect(projectPath(result.roots.interface)).toContain('.tesseract/interface');
    expect(projectPath(result.roots.sessions)).toContain('.tesseract/sessions');
    expect(projectPath(result.roots.learning)).toContain('.tesseract/learning');
    expect(result.supplements.sharedPatterns).toContain('knowledge/patterns/core.patterns.yaml');
    expect(result.knowledge).toEqual([
      {
        screen: 'policy-search',
        surface: expect.stringContaining('policy-search.surface.yaml'),
        elements: expect.stringContaining('policy-search.elements.yaml'),
        postures: expect.stringContaining('policy-search.postures.yaml'),
        hints: expect.stringContaining('policy-search.hints.yaml'),
      },
    ]);
  } finally {
    workspace.cleanup();
  }
});

test('harvest visits declared route variants and writes route-scoped receipts', async () => {
  const workspace = createTestWorkspace('compiler-harvest');
  try {
    const result = await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const index = workspace.readJson<{
      app: string;
      receipts: Array<{ routeId: string; variantId: string; status: string; receiptPath?: string }>;
    }>('.tesseract', 'discovery', 'demo', 'index.json');
    const defaultReceipt = workspace.readJson<{
      app: string;
      routeId: string;
      variantId: string;
      url: string;
      targets: unknown[];
      selectorProbes: unknown[];
    }>('.tesseract', 'discovery', 'demo', 'policy-search', 'default', 'crawl.json');
    const seededReceipt = workspace.readJson<{ variantId: string; url: string }>(
      '.tesseract',
      'discovery',
      'demo',
      'policy-search',
      'results-with-policy',
      'crawl.json',
    );

    expect(result.failures).toEqual([]);
    expect(result.receipts).toEqual([
      '.tesseract/discovery/demo/policy-search/default/crawl.json',
      '.tesseract/discovery/demo/policy-search/results-with-policy/crawl.json',
    ]);
    expect(index.app).toBe('demo');
    expect(index.receipts).toHaveLength(2);
    expect(index.receipts.every((entry) => entry.status === 'ok')).toBeTruthy();
    expect(defaultReceipt.app).toBe('demo');
    expect(defaultReceipt.routeId).toBe('policy-search');
    expect(defaultReceipt.variantId).toBe('default');
    expect(defaultReceipt.url.startsWith('file:///')).toBeTruthy();
    expect(defaultReceipt.targets.length).toBeGreaterThan(0);
    expect(defaultReceipt.selectorProbes.length).toBeGreaterThan(0);
    expect(seededReceipt.variantId).toBe('results-with-policy');
    expect(seededReceipt.url).toContain('seed=POL-001');
  } finally {
    workspace.cleanup();
  }
});

test('surface inspection returns approved structure plus derived capabilities', async () => {
  const workspace = createTestWorkspace('compiler-surface');
  try {
    const result = await runWithLocalServices(inspectSurface({ screen: policySearchScreenId, paths: workspace.paths }), workspace.rootDir);
    const resultsGrid = result.surfaceGraph.surfaces[resultsGridId];

    expect(resultsGrid?.assertions).toEqual(['structure', 'state']);
    expect(result.capabilities.some((entry) => entry.targetKind === 'surface' && entry.target === searchFormId)).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('workflow inspection exposes lane ownership, controls, and precedence for a seeded scenario', async () => {
  const workspace = createTestWorkspace('compiler-workflow');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );
    const result = await runWithLocalServices(
      inspectWorkflow({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(result.lanes.map((lane) => lane.lane)).toEqual([
      'intent',
      'knowledge',
      'control',
      'resolution',
      'execution',
      'governance/projection',
    ]);
    expect(result.controls.datasets).toContainEqual(expect.objectContaining({
      name: 'demo-default',
      artifactPath: 'controls/datasets/demo-default.dataset.yaml',
      isDefault: true,
    }));
    expect(result.controls.runbooks).toContainEqual(expect.objectContaining({
      name: 'demo-smoke',
      dataset: 'demo-default',
      resolutionControl: 'demo-policy-search',
    }));
    expect(result.controls.resolutionControls).toContainEqual(expect.objectContaining({
      name: 'demo-policy-search',
      stepIndex: 2,
    }));
    expect(result.precedence.resolution).toEqual([
      'scenario explicit',
      'resolution controls',
      'approved knowledge priors',
      'approved-equivalent overlays',
      'structured translation',
      'live DOM',
      'needs-human',
    ]);
    expect(result.selection.runbook).toBe('demo-smoke');
    expect(Array.isArray(result.hotspots)).toBeTruthy();
    expect(result.fingerprints?.task).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('run emits interpretation and execution receipts, then reprojects review surfaces', async () => {
  const workspace = createTestWorkspace('compiler-run');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const run = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const traceArtifact = JSON.parse(readFileSync(run.emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(run.emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    const runRecord = JSON.parse(readFileSync(run.runPath, 'utf8').replace(/^\uFEFF/, ''));
    const proposalBundle = JSON.parse(readFileSync(run.proposalsPath, 'utf8').replace(/^\uFEFF/, ''));
    const graph = JSON.parse(readFileSync(run.graph.graphPath, 'utf8').replace(/^\uFEFF/, ''));
    await runWithLocalServices(emitOperatorInbox({ paths: workspace.paths, filter: { adoId: '10001' } }), workspace.rootDir);
    const inboxReport = readFileSync(workspace.resolve('generated', 'operator', 'inbox.md'), 'utf8').replace(/^\uFEFF/, '');

    expect(runRecord.kind).toBe('scenario-run-record');
    expect(runRecord.steps).toHaveLength(4);
    expect(runRecord.steps.every((step: { interpretation: { kind: string } }) => step.interpretation.kind === 'resolved')).toBeTruthy();
    expect(traceArtifact.summary.provenanceKinds['approved-knowledge']).toBe(4);
    expect(traceArtifact.summary.provenanceKinds.unresolved).toBe(0);
    expect(traceArtifact.steps.every((step: { runtime: { status: string } }) => step.runtime.status === 'resolved')).toBeTruthy();
    expect(review).toContain('Runtime: resolved');
    expect(review).toContain('Interface graph fingerprint:');
    expect(review).toContain('Selector canon fingerprint:');
    expect(review).toContain('Agent sessions: 1');
    expect(review).toContain('Learning corpora: 3');
    expect(proposalBundle.proposals).toEqual([]);
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.runtimeStatus).toBe('resolved');
    expect(inboxReport).toContain('## Hotspot suggestions');
  } finally {
    workspace.cleanup();
  }
});


test('replay interpretation law: same provider and inputs yields no drift', async () => {
  const workspace = createTestWorkspace('compiler-replay-no-drift');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }), workspace.rootDir);
    const replay = await runWithLocalServices(
      replayInterpretation({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const drift = JSON.parse(readFileSync(replay.driftPath, 'utf8').replace(/^﻿/, ''));

    expect(drift.hasDrift).toBeFalsy();
    expect(drift.changedStepCount).toBe(0);
    expect(drift.explainableByFingerprintDelta).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('trace and impact queries operate over the derived graph without repo lore', async () => {
  const workspace = createTestWorkspace('compiler-trace-impact');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const trace = await runWithLocalServices(traceScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const impact = await runWithLocalServices(
      impactNode({ nodeId: graphIds.element(policySearchScreenId, searchButtonId), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(trace.nodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
    expect(trace.nodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.generatedSpec(adoId))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.step(adoId, 2))).toBeFalsy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.element(policySearchScreenId, resultsTableId))).toBeFalsy();
  } finally {
    workspace.cleanup();
  }
});


test('emit, types, and graph projections expose aligned incremental metadata for equivalent cache states', async () => {
  const workspace = createTestWorkspace('compiler-incremental-shape');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    const emitHit = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const typesHit = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphHit = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    expect(emitHit.incremental.status).toBe('cache-hit');
    expect(typesHit.incremental.status).toBe('cache-hit');
    expect(graphHit.incremental.status).toBe('cache-hit');

    const hitKeys = incrementalKeys(emitHit.incremental as unknown as Record<string, unknown>);
    expect(incrementalKeys(typesHit.incremental as unknown as Record<string, unknown>)).toEqual(hitKeys);
    expect(incrementalKeys(graphHit.incremental as unknown as Record<string, unknown>)).toEqual(hitKeys);

    unlinkSync(refresh.compile.emitted.outputPath);
    unlinkSync(typesHit.outputPath);
    unlinkSync(workspace.paths.graphIndexPath);

    const emitMiss = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const typesMiss = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphMiss = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    const emitMissIncremental = expectCacheMiss(emitMiss.incremental);
    const typesMissIncremental = expectCacheMiss(typesMiss.incremental);
    const graphMissIncremental = expectCacheMiss(graphMiss.incremental);

    expect(emitMissIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(typesMissIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(graphMissIncremental.cacheInvalidationReason).toBe('missing-output');

    const missKeys = incrementalKeys(emitMissIncremental as unknown as Record<string, unknown>);
    expect(incrementalKeys(typesMissIncremental as unknown as Record<string, unknown>)).toEqual(missKeys);
    expect(incrementalKeys(graphMissIncremental as unknown as Record<string, unknown>)).toEqual(missKeys);
  } finally {
    workspace.cleanup();
  }
});

test('graph and types skip rewrites when fingerprinted inputs are unchanged', async () => {
  const workspace = createTestWorkspace('compiler-cache');
  try {
    const graphFirst = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const typesFirst = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphManifestPath = path.join(workspace.paths.graphDir, 'build-manifest.json');
    const typesMetadataPath = path.join(workspace.paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
    const graphMtimeBefore = statSync(workspace.paths.graphIndexPath).mtimeMs;
    const typesMtimeBefore = statSync(typesFirst.outputPath).mtimeMs;
    const graphFingerprintBefore = JSON.parse(readFileSync(graphManifestPath, 'utf8')).outputFingerprint;
    const typesFingerprintBefore = JSON.parse(readFileSync(typesMetadataPath, 'utf8')).outputFingerprint;

    await wait(20);

    const graphSecond = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const typesSecond = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphMtimeAfter = statSync(workspace.paths.graphIndexPath).mtimeMs;
    const typesMtimeAfter = statSync(typesSecond.outputPath).mtimeMs;
    const graphFingerprintAfter = JSON.parse(readFileSync(graphManifestPath, 'utf8')).outputFingerprint;
    const typesFingerprintAfter = JSON.parse(readFileSync(typesMetadataPath, 'utf8')).outputFingerprint;

    expect(graphFirst.incremental.status).toMatch(/cache-(hit|miss)/);
    expect(typesFirst.incremental.status).toMatch(/cache-(hit|miss)/);
    expect(graphSecond.incremental.status).toBe('cache-hit');
    expect(typesSecond.incremental.status).toBe('cache-hit');
    expect(graphMtimeAfter).toBe(graphMtimeBefore);
    expect(typesMtimeAfter).toBe(typesMtimeBefore);
    expect(graphSecond.incremental.outputFingerprint).toBe(graphFirst.incremental.outputFingerprint);
    expect(typesSecond.incremental.outputFingerprint).toBe(typesFirst.incremental.outputFingerprint);
    expect(graphFingerprintAfter).toBe(graphFingerprintBefore);
    expect(typesFingerprintAfter).toBe(typesFingerprintBefore);
  } finally {
    workspace.cleanup();
  }
});

test('emit skips rewrites when the bound scenario and rendered artifacts are unchanged', async () => {
  const workspace = createTestWorkspace('compiler-emit-cache');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const suitePath = refresh.compile.compileSnapshot.boundScenario.metadata.suite;
    const manifestPath = emitManifestPath(workspace.paths, suitePath, adoId);
    const specMtimeBefore = statSync(refresh.compile.emitted.outputPath).mtimeMs;
    const traceMtimeBefore = statSync(refresh.compile.emitted.tracePath).mtimeMs;
    const reviewMtimeBefore = statSync(refresh.compile.emitted.reviewPath).mtimeMs;
    const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    await wait(20);

    const emittedAgain = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    expect(emittedAgain.incremental.status).toBe('cache-hit');
    expect(statSync(refresh.compile.emitted.outputPath).mtimeMs).toBe(specMtimeBefore);
    expect(statSync(refresh.compile.emitted.tracePath).mtimeMs).toBe(traceMtimeBefore);
    expect(statSync(refresh.compile.emitted.reviewPath).mtimeMs).toBe(reviewMtimeBefore);
    expect(manifestAfter.outputFingerprint).toBe(manifestBefore.outputFingerprint);
    expect(emittedAgain.incremental.outputFingerprint).toBe(manifestBefore.outputFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('emit regenerates when manifest is present but generated artifacts are missing or corrupted', async () => {
  const workspace = createTestWorkspace('compiler-emit-regenerate');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const suitePath = refresh.compile.compileSnapshot.boundScenario.metadata.suite;
    const manifestPath = emitManifestPath(workspace.paths, suitePath, adoId);
    const relativeSpec = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.outputPath));
    const relativeTrace = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.tracePath));
    const relativeReview = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.reviewPath));
    const relativeProposals = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.proposalsPath));
    const relativeManifest = projectPath(path.relative(workspace.rootDir, manifestPath));

    unlinkSync(refresh.compile.emitted.reviewPath);

    const rebuiltMissingOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeSpec);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeTrace);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeReview);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeProposals);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(refresh.compile.emitted.tracePath, '{"bad":', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltInvalidOutputIncremental = expectCacheMiss(rebuiltInvalidOutput.incremental);
    expect(rebuiltInvalidOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeSpec);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeTrace);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeReview);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeProposals);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutputIncremental.outputFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('types regenerate when manifest is present but generated output is deleted or corrupted', async () => {
  const workspace = createTestWorkspace('compiler-types-regenerate');
  try {
    const metadataPath = path.join(workspace.paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');

    const firstBuild = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const firstManifest = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    unlinkSync(firstBuild.outputPath);

    const rebuiltMissingOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(rebuiltMissingOutput.outputPath, `export const corrupted = true;\n`, 'utf8');

    const rebuiltCorruptedOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterCorruption = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltCorruptedOutputIncremental = expectCacheMiss(rebuiltCorruptedOutput.incremental);
    expect(rebuiltCorruptedOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltCorruptedOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltCorruptedOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterCorruption.outputFingerprint).toBe(rebuiltCorruptedOutputIncremental.outputFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterCorruption.inputSetFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('graph rebuilds when manifest is present but cached graph is missing or invalid', async () => {
  const workspace = createTestWorkspace('compiler-graph-regenerate');
  try {
    const manifestPath = path.join(workspace.paths.graphDir, 'build-manifest.json');

    const firstBuild = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const firstManifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    unlinkSync(workspace.paths.graphIndexPath);

    const rebuiltMissingOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(workspace.paths.graphIndexPath, '{"bad":true}', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltInvalidOutputIncremental = expectCacheMiss(rebuiltInvalidOutput.incremental);
    expect(rebuiltInvalidOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutputIncremental.outputFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterInvalidOutput.inputSetFingerprint);
    expect(firstBuild.graph.nodes.length).toBeGreaterThan(0);
  } finally {
    workspace.cleanup();
  }
});

test('graph projection includes policy decision audit nodes and governs edges', async () => {
  const workspace = createTestWorkspace('compiler-policy-graph');
  try {
    const evidenceDir = path.join(workspace.paths.evidenceDir, 'tests');
    const evidencePath = path.join(evidenceDir, 'policy-decision.json');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(evidencePath, JSON.stringify({
      evidence: {
        type: 'assertion-run',
        timestamp: new Date().toISOString(),
        trigger: 'assertion-mismatch',
        observation: { message: 'snapshot mismatch' },
        proposal: {
          file: 'knowledge/snapshots/policy-search/results-with-policy.yaml',
          field: 'root',
          old_value: 'A',
          new_value: 'B',
        },
        confidence: 0.99,
        risk: 'high',
        scope: 'snapshot',
      },
    }, null, 2));

    const graphResult = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const policyNode = graphResult.graph.nodes.find((node) => node.kind === 'policy-decision');
    const governsEdge = graphResult.graph.edges.find((edge) => edge.kind === 'governs');

    expect(policyNode).toBeTruthy();
    expect(policyNode?.payload?.decision).toBe('deny');
    expect(governsEdge).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('task packet separates task and knowledge fingerprints via shared interface references', async () => {
  const workspace = createTestWorkspace('task-packet-fingerprint-separation');
  try {
    const adoId = createAdoId('10001');
    const first = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const firstPacket = workspace.readJson<{ payload: { knowledgeFingerprint: string; steps: Array<{ taskFingerprint: string; knowledgeRef?: string; runtimeKnowledge?: unknown }>; interface: unknown; selectors: unknown } }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(firstPacket.payload.interface).toBeTruthy();
    expect(firstPacket.payload.selectors).toBeTruthy();
    expect(firstPacket.payload.steps.every((step) => step.knowledgeRef === 'scenario')).toBeTruthy();
    expect(firstPacket.payload.steps.every((step) => step.runtimeKnowledge === undefined)).toBeTruthy();

    const firstStepFingerprints = firstPacket.payload.steps.map((step) => step.taskFingerprint);

    const hintsPath = workspace.resolve('knowledge', 'screens', 'policy-search.hints.yaml');
    const originalHints = readFileSync(hintsPath, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(hintsPath, originalHints.replace('policy search screen', 'policy search workspace'), 'utf8');

    const second = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const secondPacket = workspace.readJson<{ payload: { knowledgeFingerprint: string; steps: Array<{ taskFingerprint: string }> }; taskFingerprint: string }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(second.compile.compileSnapshot.taskPacket.payload.knowledgeFingerprint).not.toBe(first.compile.compileSnapshot.taskPacket.payload.knowledgeFingerprint);
    expect(secondPacket.payload.steps.map((step) => step.taskFingerprint)).toEqual(firstStepFingerprints);
    expect(secondPacket.taskFingerprint).not.toBe(first.compile.compileSnapshot.taskPacket.taskFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('task packet size stays bounded with shared interface references', async () => {
  const workspace = createTestWorkspace('task-packet-size-sanity');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const taskPath = workspace.resolve('.tesseract', 'tasks', '10001.resolution.json');
    const packet = workspace.readJson<{ payload: { interface: unknown; selectors: unknown; steps: Array<{ runtimeKnowledge?: unknown }> } }>('.tesseract', 'tasks', '10001.resolution.json');
    const sizeBytes = statSync(taskPath).size;

    expect(packet.payload.interface).toBeTruthy();
    expect(packet.payload.selectors).toBeTruthy();
    expect(packet.payload.steps.some((step) => step.runtimeKnowledge !== undefined)).toBeFalsy();
    expect(sizeBytes).toBeLessThan(150_000);
  } finally {
    workspace.cleanup();
  }
});

test('interface intelligence compiles deterministic graph and selector canon with grounded task packets', async () => {
  const workspace = createTestWorkspace('interface-intelligence');
  try {
    const discoveryDir = workspace.resolve('.tesseract', 'discovery', 'policy-search');
    mkdirSync(discoveryDir, { recursive: true });
      const discoveryTargetRef = `target:element:${policySearchScreenId}:${policyNumberInputId}`;
      writeFileSync(
        path.join(discoveryDir, 'crawl.json'),
        `${JSON.stringify({
          kind: 'discovery-run',
          version: 2,
          stage: 'preparation',
          scope: 'workspace',
          governance: 'approved',
          app: 'demo',
          routeId: 'policy-search',
          variantId: 'default',
          routeVariantRef: 'route-variant:demo:policy-search:default',
          runId: 'seeded-discovery-run',
          screen: 'policy-search',
          url: '/policy-search',
        title: 'Policy Search',
        discoveredAt: '2026-03-10T00:00:00.000Z',
        artifactPath: '.tesseract/discovery/policy-search/crawl.json',
        rootSelector: 'body',
        snapshotHash: 'sha256:seeded-discovery',
        sections: [{
          id: 'searchFormSection',
          depth: 0,
          selector: 'form',
          surfaceIds: ['search-form'],
          elementIds: ['policyNumberInput'],
        }],
        surfaces: [{
          id: 'search-form',
          targetRef: `target:surface:${policySearchScreenId}:search-form`,
          section: 'searchFormSection',
          selector: 'form',
          role: 'form',
          name: 'Search form',
          kind: 'form',
          assertions: ['state'],
          testId: 'policy-search-form',
        }],
        elements: [{
          id: 'policyNumberInput',
          targetRef: discoveryTargetRef,
          surface: 'search-form',
          selector: "[data-testid='policy-number']",
          role: 'textbox',
          name: 'Policy Number',
          testId: 'policy-number',
          widget: 'os-input',
          required: true,
          locatorHint: 'test-id',
          locatorCandidates: [{ kind: 'test-id', value: 'policy-number' }],
        }],
        snapshotAnchors: [],
        targets: [{
          targetRef: discoveryTargetRef,
          graphNodeId: graphIds.target(discoveryTargetRef),
          kind: 'element',
          screen: 'policy-search',
          section: 'searchFormSection',
          surface: 'search-form',
          element: 'policyNumberInput',
        }],
        reviewNotes: [],
        selectorProbes: [{
          id: `${discoveryTargetRef}:probe:test-id:0`,
          selectorRef: `selector:${discoveryTargetRef}:test-id:0:policy-number`,
          targetRef: discoveryTargetRef,
          graphNodeId: graphIds.target(discoveryTargetRef),
          screen: 'policy-search',
          section: 'searchFormSection',
          element: 'policyNumberInput',
          strategy: { kind: 'test-id', value: 'policy-number' },
          source: 'discovery',
          variantRef: 'route-variant:demo:policy-search:default',
        }],
        graphDeltas: {
          nodeIds: [graphIds.target(discoveryTargetRef)],
          edgeIds: [],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const adoId = createAdoId('10001');
    const first = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const firstGraph = workspace.readJson<{ fingerprint: string; discoveryRunIds: string[]; nodes: Array<{ id: string; kind: string }> }>('.tesseract', 'interface', 'index.json');
    const firstSelectors = workspace.readJson<{ fingerprint: string; entries: Array<{ probes: Array<{ selectorRef: string; source: string }> }> }>('.tesseract', 'interface', 'selectors.json');
    const taskPacket = workspace.readJson<{
      payload: {
        interface: { fingerprint?: string };
        selectors: { fingerprint?: string };
        steps: Array<{ grounding?: { selectorRefs: string[] } }>;
      };
    }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(firstGraph.discoveryRunIds).toContain('seeded-discovery-run');
    expect(firstGraph.nodes.some((node) => node.kind === 'harvest-run' && node.id === 'harvest-run:seeded-discovery-run')).toBeTruthy();
    expect(firstSelectors.entries.some((entry) => entry.probes.some((probe) => probe.source === 'discovery' && probe.selectorRef.includes('policy-number')))).toBeTruthy();
    expect(taskPacket.payload.interface.fingerprint).toBe(firstGraph.fingerprint);
    expect(taskPacket.payload.selectors.fingerprint).toBe(firstSelectors.fingerprint);
    expect(taskPacket.payload.steps.every((step) => step.grounding !== undefined)).toBeTruthy();
    expect(taskPacket.payload.steps.some((step) => (step.grounding?.selectorRefs.length ?? 0) > 0)).toBeTruthy();
    expect(first.compile.compileSnapshot.taskPacket.payload.interface.fingerprint).toBe(firstGraph.fingerprint);
    expect(first.compile.compileSnapshot.taskPacket.payload.selectors.fingerprint).toBe(firstSelectors.fingerprint);

    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const secondGraph = workspace.readJson<{ fingerprint: string }>('.tesseract', 'interface', 'index.json');
    const secondSelectors = workspace.readJson<{ fingerprint: string }>('.tesseract', 'interface', 'selectors.json');

    expect(secondGraph.fingerprint).toBe(firstGraph.fingerprint);
    expect(secondSelectors.fingerprint).toBe(firstSelectors.fingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('agent session adapters share one provider-agnostic event vocabulary', async () => {
  const workspace = createTestWorkspace('agent-session-vocabulary');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);
    const taskPacket = catalog.taskPackets.find((entry) => entry.artifact.payload.adoId === adoId)?.artifact;

    expect(taskPacket).toBeTruthy();
    if (!taskPacket) {
      throw new Error('task packet is required');
    }

    const input = {
      adoId,
      runId: 'session-run',
      sessionId: 'session-run',
      taskPacket,
      interfaceGraph: catalog.interfaceGraph?.artifact ?? null,
      selectorCanon: catalog.selectorCanon?.artifact ?? null,
      proposalBundle: null,
      learningManifest: catalog.learningManifest?.artifact ?? null,
    };

    const deterministic = resolveAgentSessionAdapter('deterministic-agent-session').eventVocabulary(input);
    const copilot = resolveAgentSessionAdapter('copilot-vscode-chat').eventVocabulary(input);
    const deterministicTypes = [...new Set(deterministic.map((event) => event.type))].sort((left, right) => left.localeCompare(right));
    const copilotTypes = [...new Set(copilot.map((event) => event.type))].sort((left, right) => left.localeCompare(right));

    expect(deterministicTypes).toEqual(copilotTypes);
    expect(deterministicTypes).toEqual(['artifact-inspection', 'execution-reviewed', 'orientation']);
  } finally {
    workspace.cleanup();
  }
});

test('run scenario emits agent session and learning artifacts with replay-ready provenance', async () => {
  const workspace = createTestWorkspace('agent-session-learning');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const decomposition = workspace.readJson<Array<{ runtime: string; graphNodeIds: string[]; selectorRefs: string[] }>>(
      '.tesseract',
      'learning',
      'decomposition',
      '10001.fragments.json',
    );
    const workflow = workspace.readJson<Array<{ runtime: string; graphNodeIds: string[]; selectorRefs: string[] }>>(
      '.tesseract',
      'learning',
      'workflow',
      '10001.fragments.json',
    );
    const compileManifest = workspace.readJson<{ kind: string; corpora: Array<{ runtime: string; exampleCount: number }> }>(
      '.tesseract',
      'learning',
      'manifest.json',
    );

    expect(decomposition.every((fragment) => fragment.runtime === 'decomposition')).toBeTruthy();
    expect(workflow[0]?.runtime).toBe('workflow');
    expect(workflow[0]?.graphNodeIds.length).toBeGreaterThan(0);
    expect(workflow[0]?.selectorRefs.length).toBeGreaterThan(0);
    expect(compileManifest.kind).toBe('training-corpus-manifest');
    expect(compileManifest.corpora.map((entry) => entry.runtime)).toEqual(['decomposition', 'repair-recovery', 'workflow']);

    const run = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const session = workspace.readJson<{ sessionId: string; adapterId: string; eventCount: number; eventTypes: Record<string, number>; transcripts: Array<{ kind: string }> }>(
      '.tesseract',
      'sessions',
      run.runId,
      'session.json',
    );
    const sessionEvents = workspace.readText('.tesseract', 'sessions', run.runId, 'events.jsonl')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type: string });
    const repair = workspace.readJson<Array<{ runtime: string }>>(
      '.tesseract',
      'learning',
      'repair-recovery',
      '10001.fragments.json',
    );
    const replay = workspace.readJson<{ runtime: string; fragmentIds: string[]; graphNodeIds: string[]; selectorRefs: string[] }>(
      '.tesseract',
      'learning',
      'replays',
      `10001.${run.runId}.json`,
    );
    const manifest = workspace.readJson<{ replayExamples: number; corpora: Array<{ runtime: string; exampleCount: number }> }>(
      '.tesseract',
      'learning',
      'manifest.json',
    );
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    expect(session.sessionId).toBe(run.runId);
    expect(session.adapterId).toBe('deterministic-agent-session');
    expect(session.eventCount).toBe(sessionEvents.length);
    expect(session.transcripts[0]?.kind).toBe('none');
    expect(session.eventTypes.orientation).toBe(1);
    expect(session.eventTypes['artifact-inspection']).toBe(1);
    expect(session.eventTypes['execution-reviewed']).toBe(1);
    expect(sessionEvents.map((event) => event.type)).toEqual(['orientation', 'artifact-inspection', 'execution-reviewed']);
    expect(repair.every((fragment) => fragment.runtime === 'repair-recovery')).toBeTruthy();
    expect(replay.runtime).toBe('workflow');
    expect(replay.fragmentIds.length).toBeGreaterThan(0);
    expect(replay.graphNodeIds.length).toBeGreaterThan(0);
    expect(replay.selectorRefs.length).toBeGreaterThan(0);
    expect(manifest.replayExamples).toBe(1);
    expect(catalog.agentSessions.some((entry) => entry.artifact.sessionId === run.runId)).toBeTruthy();
    expect(catalog.learningManifest?.artifact.replayExamples).toBe(1);
    expect(catalog.replayExamples.some((entry) => entry.artifact.runId === run.runId)).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});
