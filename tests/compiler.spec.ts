import { readFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { impactNode } from '../lib/application/impact';
import { describeScenarioPaths } from '../lib/application/inspect';
import { createProjectPaths } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { inspectSurface } from '../lib/application/surface';
import { traceScenario } from '../lib/application/trace';
import { createAdoId, createElementId, createScreenId, createSurfaceId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { runWithLocalServices } from '../lib/infrastructure/local-services';

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
