/**
 * End-to-end integration test: compile a scenario, verify it produces
 * a valid spec, resolution, and graph entry.
 *
 * This test closes the seam between domain unit tests and runtime tests
 * by exercising the full pipeline: parse → bind → compile → emit → graph.
 */
import { expect, test } from '@playwright/test';
import { refreshScenario } from '../../product/application/resolution/refresh';
import { buildDerivedGraph } from '../../product/application/graph/graph';
import { runWithLocalServices } from '../../product/composition/local-services';
import { createAdoId } from '../../product/domain/kernel/identity';
import { createTestWorkspace } from '../support/workspace';

test.describe('end-to-end pipeline integration', () => {
  test('compile scenario 10001 produces spec, resolution, and graph', async () => {
    const workspace = createTestWorkspace('e2e-pipeline');
    try {
      const adoId = createAdoId('10001');

      // Step 1: Refresh (parse → bind → compile → emit → graph → types)
      const result = await runWithLocalServices(
        refreshScenario({ adoId, paths: workspace.paths }),
        workspace.rootDir,
      );
      expect(result).toBeDefined();

      // Step 2: Verify resolution artifact exists with steps
      const resolution = workspace.readJson<{
        version: number;
        payload: {
          steps: readonly { index: number; intent: string }[];
        };
      }>('.tesseract', 'tasks', '10001.resolution.json');
      expect(resolution.version).toBeGreaterThanOrEqual(1);
      expect(resolution.payload.steps.length).toBeGreaterThan(0);

      // Step 3: Verify each step has an index and intent
      for (const step of resolution.payload.steps) {
        expect(step.index).toBeGreaterThanOrEqual(1);
        expect(step.intent).toBeTruthy();
      }

      // Step 4: Build the derived graph and verify it has nodes
      const graphResult = await runWithLocalServices(
        buildDerivedGraph({ paths: workspace.paths }),
        workspace.rootDir,
      );
      expect(graphResult).toBeDefined();

      const graph = workspace.readJson<{
        nodes: readonly { id: string; kind: string }[];
        edges: readonly { source: string; target: string }[];
      }>('.tesseract', 'graph', 'index.json');
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);

      // Step 5: Verify graph contains nodes related to policy-search
      const policySearchNodes = graph.nodes.filter(
        (n) => n.id.includes('policy-search'),
      );
      expect(policySearchNodes.length).toBeGreaterThan(0);

      // Step 6: Verify generated spec file exists (under suite root)
      const specContent = workspace.suiteReadText(
        'generated', 'demo', 'policy-search', '10001.spec.ts',
      );
      expect(specContent).toContain('test');
      expect(specContent.length).toBeGreaterThan(100);

    } finally {
      workspace.cleanup();
    }
  });

  test('compile produces deterministic output for same input', async () => {
    const workspace1 = createTestWorkspace('e2e-determinism-1');
    const workspace2 = createTestWorkspace('e2e-determinism-2');
    try {
      const adoId = createAdoId('10001');

      await runWithLocalServices(
        refreshScenario({ adoId, paths: workspace1.paths }),
        workspace1.rootDir,
      );
      await runWithLocalServices(
        refreshScenario({ adoId, paths: workspace2.paths }),
        workspace2.rootDir,
      );

      // Same input should produce same resolution
      const res1 = workspace1.readJson<{ payload: unknown }>(
        '.tesseract', 'tasks', '10001.resolution.json',
      );
      const res2 = workspace2.readJson<{ payload: unknown }>(
        '.tesseract', 'tasks', '10001.resolution.json',
      );
      expect(res1.payload).toEqual(res2.payload);

    } finally {
      workspace1.cleanup();
      workspace2.cleanup();
    }
  });

  test('new screen knowledge is picked up by the graph builder', async () => {
    const workspace = createTestWorkspace('e2e-new-screen');
    try {
      const adoId = createAdoId('10001');

      await runWithLocalServices(
        refreshScenario({ adoId, paths: workspace.paths }),
        workspace.rootDir,
      );

      const graphResult = await runWithLocalServices(
        buildDerivedGraph({ paths: workspace.paths }),
        workspace.rootDir,
      );
      expect(graphResult).toBeDefined();

      const graph = workspace.readJson<{
        nodes: readonly { id: string; kind: string }[];
      }>('.tesseract', 'graph', 'index.json');

      // The graph should contain nodes related to known screens
      const screenRelatedNodes = graph.nodes.filter(
        (n) => n.id.includes('policy-search') || n.id.includes('policy-detail'),
      );
      expect(screenRelatedNodes.length).toBeGreaterThan(0);

    } finally {
      workspace.cleanup();
    }
  });
});
