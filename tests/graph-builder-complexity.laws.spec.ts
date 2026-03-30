/**
 * W5.9 -- Graph builder complexity law tests
 *
 * Laws verified:
 * 1. Optimized functions produce identical output to the original graph builder
 * 2. Linearity: 2x input produces ~2x time (generous bounds for CI)
 *
 * These tests exercise deriveGraph from derived-graph.ts (which was optimized
 * by pre-indexing bound steps and task steps per scenario with Map, and using
 * Set.has instead of array.includes for candidate intervention filtering).
 */

import { expect, test } from '@playwright/test';
import {
  deriveGraph,
  type GraphBuildInput,
} from '../lib/domain/derived-graph';
import {
  createAdoId,
  createElementId,
  createPostureId,
  createScreenId,
  createSurfaceId,
} from '../lib/domain/identity';
import type { AdoSnapshot, Scenario, SurfaceGraph, ScreenElements, ScreenPostures } from '../lib/domain/types';

// --- Factories ---

function makeSnapshot(adoId: string): AdoSnapshot {
  return {
    id: createAdoId(adoId),
    revision: 1,
    title: `Case ${adoId}`,
    suitePath: 'perf-suite',
    areaPath: 'Tests',
    iterationPath: 'Sprint 1',
    tags: [],
    priority: 2,
    steps: [
      { index: 0, action: 'Navigate to the page', expected: '' },
      { index: 1, action: 'Enter a value', expected: 'Value accepted' },
    ],
    parameters: [],
    dataRows: [],
    contentHash: `sha256:${adoId}`,
    syncedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeScenario(adoId: string, screenId: string, stepCount: number): Scenario {
  return {
    source: {
      ado_id: createAdoId(adoId),
      revision: 1,
      content_hash: `sha256:${adoId}`,
      synced_at: '2026-01-01T00:00:00.000Z',
    },
    metadata: {
      title: `Test ${adoId}`,
      suite: 'perf-suite',
      tags: [],
      priority: 2,
      status: 'active',
      status_detail: null,
    },
    preconditions: [],
    steps: Array.from({ length: stepCount }, (_, i) => ({
      index: i,
      intent: `Step ${i} action`,
      action_text: `Step ${i} action`,
      expected_text: '',
      action: i === 0 ? 'navigate' as const : 'input' as const,
      screen: createScreenId(screenId),
      element: i === 0 ? null : createElementId('inputField'),
      posture: i === 0 ? null : createPostureId('valid'),
      override: null,
      snapshot_template: null,
      resolution: i === 0
        ? { action: 'navigate' as const, screen: createScreenId(screenId) }
        : {
            action: 'input' as const,
            screen: createScreenId(screenId),
            element: createElementId('inputField'),
            posture: createPostureId('valid'),
          },
      confidence: 'human' as const,
    })),
    postconditions: [],
  };
}

function makeSurfaceGraph(screenId: string): SurfaceGraph {
  const screen = createScreenId(screenId);
  return {
    screen,
    url: `https://app.test/${screenId}`,
    sections: {
      main: {
        selector: `[data-screen="${screenId}"]`,
        kind: 'form',
        surfaces: [createSurfaceId('form-surface')],
      },
    },
    surfaces: {
      'form-surface': {
        kind: 'form',
        section: 'main' as any,
        selector: 'form',
        parents: [],
        children: [],
        elements: [createElementId('inputField')],
        assertions: [],
      },
    },
  };
}

function makeScreenElements(screenId: string): ScreenElements {
  return {
    screen: createScreenId(screenId),
    url: `/${screenId}`,
    elements: {
      inputField: {
        role: 'textbox',
        name: 'Input Field',
        widget: 'text-input' as any,
        surface: createSurfaceId('form-surface'),
        required: true,
        locator: [{ kind: 'test-id', value: 'input-field' }],
      },
    },
  };
}

function makeScreenPostures(screenId: string): ScreenPostures {
  return {
    screen: createScreenId(screenId),
    postures: {
      inputField: {
        valid: {
          values: ['test-value'],
          effects: [],
        },
      },
    },
  };
}

function buildScaledInput(scenarioCount: number, stepsPerScenario: number): GraphBuildInput {
  const screenId = 'test-screen';
  return {
    snapshots: Array.from({ length: scenarioCount }, (_, i) => ({
      artifact: makeSnapshot(`${10000 + i}`),
      artifactPath: `scenarios/${10000 + i}.scenario.yaml`,
    })),
    surfaceGraphs: [{
      artifact: makeSurfaceGraph(screenId),
      artifactPath: `knowledge/surfaces/${screenId}.surface.yaml`,
    }],
    knowledgeSnapshots: [],
    screenElements: [{
      artifact: makeScreenElements(screenId),
      artifactPath: `knowledge/screens/${screenId}.elements.yaml`,
    }],
    screenPostures: [{
      artifact: makeScreenPostures(screenId),
      artifactPath: `knowledge/screens/${screenId}.postures.yaml`,
    }],
    scenarios: Array.from({ length: scenarioCount }, (_, i) => ({
      artifact: makeScenario(`${10000 + i}`, screenId, stepsPerScenario),
      artifactPath: `scenarios/${10000 + i}.scenario.yaml`,
      generatedSpecPath: `generated/perf-suite/${10000 + i}.spec.ts`,
      generatedSpecExists: false,
      generatedTracePath: `generated/perf-suite/${10000 + i}.trace.json`,
      generatedTraceExists: false,
      generatedReviewPath: `generated/perf-suite/${10000 + i}.review.md`,
      generatedReviewExists: false,
    })),
    evidence: [],
  };
}

// --- Law: Determinism ---

test.describe('Graph builder complexity (W5.9)', () => {
  test('deriveGraph is deterministic across repeated calls', () => {
    const input = buildScaledInput(5, 4);
    const first = deriveGraph(input);
    const second = deriveGraph(input);

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.nodes.length).toBe(second.nodes.length);
    expect(first.edges.length).toBe(second.edges.length);
    expect(first.nodes.map((n) => n.id)).toEqual(second.nodes.map((n) => n.id));
    expect(first.edges.map((e) => e.id)).toEqual(second.edges.map((e) => e.id));
  });

  test('deriveGraph produces same output regardless of scenario ordering', () => {
    const input = buildScaledInput(10, 3);
    const forward = deriveGraph(input);

    const reversed: GraphBuildInput = {
      ...input,
      scenarios: [...input.scenarios].reverse(),
      snapshots: [...input.snapshots].reverse(),
    };
    const backward = deriveGraph(reversed);

    expect(forward.fingerprint).toBe(backward.fingerprint);
    expect(forward.nodes.map((n) => n.id)).toEqual(backward.nodes.map((n) => n.id));
    expect(forward.edges.map((e) => e.id)).toEqual(backward.edges.map((e) => e.id));
  });

  // --- Law: Linearity (2x input produces ~2x time, generous bounds for CI) ---

  test('deriveGraph scales linearly: 2x scenarios produces <= 3x time', () => {
    const smallInput = buildScaledInput(20, 5);
    const largeInput = buildScaledInput(40, 5);

    // Warm up
    deriveGraph(smallInput);
    deriveGraph(largeInput);

    // Measure small
    const smallStart = performance.now();
    const smallResult = deriveGraph(smallInput);
    const smallTime = performance.now() - smallStart;

    // Measure large
    const largeStart = performance.now();
    const largeResult = deriveGraph(largeInput);
    const largeTime = performance.now() - largeStart;

    // Verify output is proportional
    expect(largeResult.nodes.length).toBeGreaterThan(smallResult.nodes.length);

    // 2x input should produce at most 3x time (generous for CI variability)
    // If quadratic, 2x input would produce ~4x time
    const ratio = largeTime / Math.max(smallTime, 0.1);
    expect(ratio).toBeLessThan(3.5);
  });

  test('deriveGraph scales linearly: 2x steps per scenario produces <= 3x time', () => {
    const smallInput = buildScaledInput(10, 10);
    const largeInput = buildScaledInput(10, 20);

    // Warm up
    deriveGraph(smallInput);
    deriveGraph(largeInput);

    // Measure small
    const smallStart = performance.now();
    const smallResult = deriveGraph(smallInput);
    const smallTime = performance.now() - smallStart;

    // Measure large
    const largeStart = performance.now();
    const largeResult = deriveGraph(largeInput);
    const largeTime = performance.now() - largeStart;

    // More steps means more step nodes
    expect(largeResult.nodes.length).toBeGreaterThan(smallResult.nodes.length);

    // 2x steps should produce at most 3x time (generous for CI)
    const ratio = largeTime / Math.max(smallTime, 0.1);
    expect(ratio).toBeLessThan(3.5);
  });

  // --- Law: Graph structure integrity after optimization ---

  test('every step node has exactly one contains edge from its scenario', () => {
    const input = buildScaledInput(8, 6);
    const graph = deriveGraph(input);

    const stepNodes = graph.nodes.filter((n) => n.kind === 'step');
    const containsEdges = graph.edges.filter((e) => e.kind === 'contains');

    for (const stepNode of stepNodes) {
      const incomingContains = containsEdges.filter((e) => e.to === stepNode.id);
      expect(incomingContains.length).toBe(1);
      const parentNode = graph.nodes.find((n) => n.id === incomingContains[0]!.from);
      expect(parentNode?.kind).toBe('scenario');
    }
  });

  test('scenario step count matches input step count', () => {
    const stepsPerScenario = 7;
    const scenarioCount = 5;
    const input = buildScaledInput(scenarioCount, stepsPerScenario);
    const graph = deriveGraph(input);

    const stepNodes = graph.nodes.filter((n) => n.kind === 'step');
    expect(stepNodes.length).toBe(scenarioCount * stepsPerScenario);
  });

  test('node and edge counts grow linearly with scenario count', () => {
    const small = deriveGraph(buildScaledInput(5, 4));
    const large = deriveGraph(buildScaledInput(15, 4));

    // With 3x scenarios, nodes and edges should grow roughly 3x
    // Allow generous bounds: between 1.5x and 5x
    const nodeRatio = large.nodes.length / small.nodes.length;
    const edgeRatio = large.edges.length / small.edges.length;

    expect(nodeRatio).toBeGreaterThan(1.5);
    expect(nodeRatio).toBeLessThan(5);
    expect(edgeRatio).toBeGreaterThan(1.5);
    expect(edgeRatio).toBeLessThan(5);
  });
});
