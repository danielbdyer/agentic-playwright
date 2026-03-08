import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { describeScenarioPaths } from '../lib/application/inspect';
import { emitScenario } from '../lib/application/emit';
import { emitManifestPath } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { inspectSurface } from '../lib/application/surface';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { createAdoId, createElementId, createScreenId, createSurfaceId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { runWithLocalServices } from '../lib/infrastructure/local-services';
import { createTestWorkspace } from './support/workspace';

const policySearchScreenId = createScreenId('policy-search');
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
    expect(result.compile.bound.boundScenario.steps.every((step) => step.confidence === 'compiler-derived')).toBeTruthy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.binding.governance === 'approved')).toBeTruthy();
    expect(generated).toContain('runStepProgram');
    expect(generated).toContain('loadScreenRegistry');
    expect(generated).toContain('compiler-derived');
    expect(traceArtifact.steps[1].supplementRefs).toContain('knowledge/patterns/core.patterns.yaml');
    expect(traceArtifact.steps[1].supplementRefs).toContain('knowledge/screens/policy-search.hints.yaml');
    expect(traceArtifact.steps[1].provenanceKind).toBe('hint-backed');
    expect(traceArtifact.summary.provenanceKinds['hint-backed']).toBeGreaterThan(0);
    expect(traceArtifact.governance).toBe('approved');
    expect(traceArtifact.steps[0].normalizedIntent).toContain('navigate');
    expect(review).toContain('# Verify policy search returns matching policy');
    expect(review).toContain('## Bottlenecks');
    expect(review).toContain('Provenance kind: hint-backed');
    expect(review).toContain('## Step 1');
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.surface(policySearchScreenId, resultsGridId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.screenHints(policySearchScreenId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.pattern('core.input'))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedTrace(adoId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedReview(adoId))).toBeTruthy();
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.provenanceKind).toBe('hint-backed');
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
    expect(projectPath(result.artifacts.graph)).toContain('.tesseract/graph/index.json');
    expect(projectPath(result.artifacts.trace)).toContain('generated/demo/policy-search/10001.trace.json');
    expect(projectPath(result.artifacts.review)).toContain('generated/demo/policy-search/10001.review.md');
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

    expect(emitMiss.incremental.status).toBe('cache-miss');
    expect(typesMiss.incremental.status).toBe('cache-miss');
    expect(graphMiss.incremental.status).toBe('cache-miss');
    expect(emitMiss.incremental.cacheInvalidationReason).toBe('missing-output');
    expect(typesMiss.incremental.cacheInvalidationReason).toBe('missing-output');
    expect(graphMiss.incremental.cacheInvalidationReason).toBe('missing-output');

    const missKeys = incrementalKeys(emitMiss.incremental as unknown as Record<string, unknown>);
    expect(incrementalKeys(typesMiss.incremental as unknown as Record<string, unknown>)).toEqual(missKeys);
    expect(incrementalKeys(graphMiss.incremental as unknown as Record<string, unknown>)).toEqual(missKeys);
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
    const suitePath = refresh.compile.compileSnapshot.boundScenario.metadata.suite;
    const manifestPath = emitManifestPath(workspace.paths, suitePath, adoId);
    const relativeSpec = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.outputPath));
    const relativeTrace = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.tracePath));
    const relativeReview = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.reviewPath));
    const relativeManifest = projectPath(path.relative(workspace.rootDir, manifestPath));

    unlinkSync(refresh.compile.emitted.reviewPath);

    const rebuiltMissingOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    expect(rebuiltMissingOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltMissingOutput.incremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain(relativeSpec);
    expect(rebuiltMissingOutput.incremental.rewritten).toContain(relativeTrace);
    expect(rebuiltMissingOutput.incremental.rewritten).toContain(relativeReview);
    expect(rebuiltMissingOutput.incremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutput.incremental.outputFingerprint);

    writeFileSync(refresh.compile.emitted.tracePath, '{"bad":', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    expect(rebuiltInvalidOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltInvalidOutput.incremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain(relativeSpec);
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain(relativeTrace);
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain(relativeReview);
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutput.incremental.outputFingerprint);
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

    expect(rebuiltMissingOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltMissingOutput.incremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutput.incremental.outputFingerprint);

    writeFileSync(rebuiltMissingOutput.outputPath, `export const corrupted = true;\n`, 'utf8');

    const rebuiltCorruptedOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterCorruption = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    expect(rebuiltCorruptedOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltCorruptedOutput.incremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltCorruptedOutput.incremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltCorruptedOutput.incremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterCorruption.outputFingerprint).toBe(rebuiltCorruptedOutput.incremental.outputFingerprint);
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

    expect(rebuiltMissingOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltMissingOutput.incremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltMissingOutput.incremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutput.incremental.outputFingerprint);

    writeFileSync(workspace.paths.graphIndexPath, '{"bad":true}', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    expect(rebuiltInvalidOutput.incremental.status).toBe('cache-miss');
    expect(rebuiltInvalidOutput.incremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltInvalidOutput.incremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutput.incremental.outputFingerprint);
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

