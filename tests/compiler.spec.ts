import { readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { impactNode } from '../lib/application/impact';
import { buildDerivedGraph } from '../lib/application/graph';
import { describeScenarioPaths } from '../lib/application/inspect';
import { createProjectPaths } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { inspectSurface } from '../lib/application/surface';
import { generateTypes } from '../lib/application/types';
import { traceScenario } from '../lib/application/trace';
import { createAdoId, createElementId, createScreenId, createSurfaceId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { runWithLocalServices } from '../lib/infrastructure/local-services';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

test('refresh recompiles the seeded scenario through graph, types, and program emission', async () => {
  const paths = createProjectPaths(process.cwd());
  const adoId = createAdoId('10001');
  const result = await runWithLocalServices(refreshScenario({ adoId, paths }), process.cwd());
  const generated = readFileSync(result.compile.emitted.outputPath, 'utf8').replace(/^\uFEFF/, '');
  const graph = JSON.parse(readFileSync(result.compile.graph.graphPath, 'utf8').replace(/^\uFEFF/, ''));

  expect(result.sync.snapshots).toHaveLength(1);
  expect(result.compile.bound.hasUnbound).toBeFalsy();
  expect(generated).toContain('runStepProgram');
  expect(generated).toContain('loadScreenRegistry');
  expect(generated).toContain('kind: "step-program"');
  expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.surface(createScreenId('policy-search'), createSurfaceId('results-grid')))).toBeTruthy();
  expect(result.compile.generatedTypes.outputPath).toContain(path.join('lib', 'generated', 'tesseract-knowledge.ts'));
});

test('paths identifies surface, graph, and generated-type artifacts for the seeded scenario', async () => {
  const paths = createProjectPaths(process.cwd());
  const result = await runWithLocalServices(describeScenarioPaths({ adoId: createAdoId('10001'), paths }), process.cwd());

  expect(result.artifacts.snapshot).toContain(path.join('.ado-sync', 'snapshots', '10001.json'));
  expect(result.artifacts.scenario).toContain(path.join('scenarios', 'demo', 'policy-search', '10001.scenario.yaml'));
  expect(result.artifacts.graph).toContain(path.join('.tesseract', 'graph', 'index.json'));
  expect(result.knowledge).toEqual([
    {
      screen: 'policy-search',
      surface: expect.stringContaining('policy-search.surface.yaml'),
      elements: expect.stringContaining('policy-search.elements.yaml'),
      postures: expect.stringContaining('policy-search.postures.yaml'),
    },
  ]);
});

test('surface inspection returns approved structure plus derived capabilities', async () => {
  const paths = createProjectPaths(process.cwd());
  const result = await runWithLocalServices(inspectSurface({ screen: createScreenId('policy-search'), paths }), process.cwd());

  expect(result.surfaceGraph.surfaces['results-grid'].assertions).toEqual(['structure', 'state']);
  expect(result.capabilities.some((entry) => entry.targetKind === 'surface' && entry.target === createSurfaceId('search-form'))).toBeTruthy();
});

test('trace and impact queries operate over the derived graph without repo lore', async () => {
  const paths = createProjectPaths(process.cwd());
  const adoId = createAdoId('10001');
  const screenId = createScreenId('policy-search');
  await runWithLocalServices(refreshScenario({ adoId, paths }), process.cwd());
  const trace = await runWithLocalServices(traceScenario({ adoId, paths }), process.cwd());
  const impact = await runWithLocalServices(impactNode({ nodeId: graphIds.element(screenId, createElementId('searchButton')), paths }), process.cwd());

  expect(trace.nodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
  expect(trace.nodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
  expect(impact.impactedNodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
  expect(impact.impactedNodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
});

test('graph and types skip rewrites when fingerprinted inputs are unchanged', async () => {
  const paths = createProjectPaths(process.cwd());
  const graphFirst = await runWithLocalServices(buildDerivedGraph({ paths }), process.cwd());
  const typesFirst = await runWithLocalServices(generateTypes({ paths }), process.cwd());
  const graphManifestPath = path.join(paths.graphDir, 'build-manifest.json');
  const typesMetadataPath = path.join(paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
  const graphMtimeBefore = statSync(paths.graphIndexPath).mtimeMs;
  const typesMtimeBefore = statSync(typesFirst.outputPath).mtimeMs;
  const graphFingerprintBefore = JSON.parse(readFileSync(graphManifestPath, 'utf8')).outputFingerprint;
  const typesFingerprintBefore = JSON.parse(readFileSync(typesMetadataPath, 'utf8')).outputFingerprint;

  await wait(20);

  const graphSecond = await runWithLocalServices(buildDerivedGraph({ paths }), process.cwd());
  const typesSecond = await runWithLocalServices(generateTypes({ paths }), process.cwd());
  const graphMtimeAfter = statSync(paths.graphIndexPath).mtimeMs;
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
});


test('types regenerate when manifest is present but generated output is deleted or corrupted', async () => {
  const paths = createProjectPaths(process.cwd());
  const metadataPath = path.join(paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');

  const firstBuild = await runWithLocalServices(generateTypes({ paths }), process.cwd());
  const firstManifest = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

  unlinkSync(firstBuild.outputPath);

  const rebuiltMissingOutput = await runWithLocalServices(generateTypes({ paths }), process.cwd());
  const manifestAfterMissingOutput = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

  expect(rebuiltMissingOutput.incremental.status).toBe('cache-miss');
  expect(rebuiltMissingOutput.incremental.cacheInvalidationReason).toBe('missing-output');
  expect(rebuiltMissingOutput.incremental.rewritten).toContain(path.join('lib', 'generated', 'tesseract-knowledge.ts'));
  expect(rebuiltMissingOutput.incremental.rewritten).toContain(path.join('lib', 'generated', 'tesseract-knowledge.metadata.json'));
  expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutput.incremental.outputFingerprint);

  writeFileSync(rebuiltMissingOutput.outputPath, `export const corrupted = true;\n`, 'utf8');

  const rebuiltCorruptedOutput = await runWithLocalServices(generateTypes({ paths }), process.cwd());
  const manifestAfterCorruption = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

  expect(rebuiltCorruptedOutput.incremental.status).toBe('cache-miss');
  expect(rebuiltCorruptedOutput.incremental.cacheInvalidationReason).toBe('invalid-output');
  expect(rebuiltCorruptedOutput.incremental.rewritten).toContain(path.join('lib', 'generated', 'tesseract-knowledge.ts'));
  expect(rebuiltCorruptedOutput.incremental.rewritten).toContain(path.join('lib', 'generated', 'tesseract-knowledge.metadata.json'));
  expect(manifestAfterCorruption.outputFingerprint).toBe(rebuiltCorruptedOutput.incremental.outputFingerprint);
  expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
  expect(firstManifest.inputSetFingerprint).toBe(manifestAfterCorruption.inputSetFingerprint);
});

test('graph rebuilds when manifest is present but cached graph is missing or invalid', async () => {
  const paths = createProjectPaths(process.cwd());
  const manifestPath = path.join(paths.graphDir, 'build-manifest.json');

  const firstBuild = await runWithLocalServices(buildDerivedGraph({ paths }), process.cwd());
  const firstManifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

  unlinkSync(paths.graphIndexPath);

  const rebuiltMissingOutput = await runWithLocalServices(buildDerivedGraph({ paths }), process.cwd());
  const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

  expect(rebuiltMissingOutput.incremental.status).toBe('cache-miss');
  expect(rebuiltMissingOutput.incremental.cacheInvalidationReason).toBe('missing-output');
  expect(rebuiltMissingOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'index.json'));
  expect(rebuiltMissingOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'mcp-catalog.json'));
  expect(rebuiltMissingOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'build-manifest.json'));
  expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutput.incremental.outputFingerprint);

  writeFileSync(paths.graphIndexPath, '{"bad":true}', 'utf8');

  const rebuiltInvalidOutput = await runWithLocalServices(buildDerivedGraph({ paths }), process.cwd());
  const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

  expect(rebuiltInvalidOutput.incremental.status).toBe('cache-miss');
  expect(rebuiltInvalidOutput.incremental.cacheInvalidationReason).toBe('invalid-output');
  expect(rebuiltInvalidOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'index.json'));
  expect(rebuiltInvalidOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'mcp-catalog.json'));
  expect(rebuiltInvalidOutput.incremental.rewritten).toContain(path.join('.tesseract', 'graph', 'build-manifest.json'));
  expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutput.incremental.outputFingerprint);
  expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
  expect(firstManifest.inputSetFingerprint).toBe(manifestAfterInvalidOutput.inputSetFingerprint);
  expect(firstBuild.graph.nodes.length).toBeGreaterThan(0);
});
