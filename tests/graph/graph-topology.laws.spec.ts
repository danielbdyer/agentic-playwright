/**
 * W2.11 — Graph Topology Law Tests
 *
 * Laws verified:
 * 1. Node uniqueness: no duplicate node IDs in any graph
 * 2. Edge referential integrity: every edge references existing nodes
 * 3. Acyclic containment hierarchy: screen -> surface -> element is a DAG
 * 4. Deterministic fingerprinting: same inputs in different order produce identical fingerprint
 */

import { expect, test } from '@playwright/test';
import {
  deriveGraph,
  mergeAccumulators,
  resolveConditionalEdges,
  EMPTY_GRAPH,
  type GraphBuildInput,
} from '../../lib/domain/graph/derived-graph';
import type { ConditionalEdge, GraphAccumulator } from '../../lib/domain/graph/derived-graph';
import {
  createAdoId,
  createElementId,
  createPostureId,
  createScreenId,
  createSurfaceId,
} from '../../lib/domain/kernel/identity';
import type { AdoSnapshot, Scenario } from '../../lib/domain/intent/types';
import type { ScreenElements, ScreenPostures, SurfaceGraph } from '../../lib/domain/knowledge/types';
import { mulberry32, randomWord, randomInt , LAW_SEED_COUNT } from '../support/random';

// ─── Factories ───

function createSnapshot(adoId: string, title: string): AdoSnapshot {
  return {
    id: createAdoId(adoId),
    revision: 1,
    title,
    suitePath: 'test-suite',
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

function createScenario(adoId: string, screenId: string): Scenario {
  return {
    source: {
      ado_id: createAdoId(adoId),
      revision: 1,
      content_hash: `sha256:${adoId}`,
      synced_at: '2026-01-01T00:00:00.000Z',
    },
    metadata: {
      title: `Test ${adoId}`,
      suite: 'test-suite',
      tags: [],
      priority: 2,
      status: 'active',
      status_detail: null,
    },
    preconditions: [],
    steps: [
      {
        index: 0,
        intent: 'Navigate to the page',
        action_text: 'Navigate to the page',
        expected_text: '',
        action: 'navigate',
        screen: createScreenId(screenId),
        element: null,
        posture: null,
        override: null,
        snapshot_template: null,
        resolution: { action: 'navigate', screen: createScreenId(screenId) },
        confidence: 'human',
      },
      {
        index: 1,
        intent: 'Enter value',
        action_text: 'Enter a value',
        expected_text: 'Value accepted',
        action: 'input',
        screen: createScreenId(screenId),
        element: createElementId('inputField'),
        posture: createPostureId('valid'),
        override: null,
        snapshot_template: null,
        resolution: {
          action: 'input',
          screen: createScreenId(screenId),
          element: createElementId('inputField'),
          posture: createPostureId('valid'),
        },
        confidence: 'human',
      },
    ],
    postconditions: [],
  };
}

function createSurfaceGraph(screenId: string): SurfaceGraph {
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

function createScreenElements(screenId: string): ScreenElements {
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

function createScreenPostures(screenId: string): ScreenPostures {
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

function buildMinimalInput(overrides?: Partial<GraphBuildInput>): GraphBuildInput {
  const screenId = 'test-screen';
  return {
    snapshots: [{
      artifact: createSnapshot('10001', 'Test Case'),
      artifactPath: 'scenarios/10001.scenario.yaml',
    }],
    surfaceGraphs: [{
      artifact: createSurfaceGraph(screenId),
      artifactPath: `knowledge/surfaces/${screenId}.surface.yaml`,
    }],
    knowledgeSnapshots: [],
    screenElements: [{
      artifact: createScreenElements(screenId),
      artifactPath: `knowledge/screens/${screenId}.elements.yaml`,
    }],
    screenPostures: [{
      artifact: createScreenPostures(screenId),
      artifactPath: `knowledge/screens/${screenId}.postures.yaml`,
    }],
    scenarios: [{
      artifact: createScenario('10001', screenId),
      artifactPath: 'scenarios/10001.scenario.yaml',
      generatedSpecPath: 'generated/test-suite/10001.spec.ts',
      generatedSpecExists: false,
      generatedTracePath: 'generated/test-suite/10001.trace.json',
      generatedTraceExists: false,
      generatedReviewPath: 'generated/test-suite/10001.review.md',
      generatedReviewExists: false,
    }],
    evidence: [],
    ...overrides,
  };
}

// ─── Law 1: Node uniqueness ───

test.describe('Graph topology: node uniqueness', () => {
  test('no duplicate node IDs in a minimal graph', () => {
    const graph = deriveGraph(buildMinimalInput());
    const ids = graph.nodes.map((n) => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  test('no duplicate node IDs across 20 random seeds with varied inputs', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const adoId = String(10000 + randomInt(next, 9000));
      const screenId = `screen-${randomWord(next)}`;

      const input = buildMinimalInput({
        snapshots: [{
          artifact: createSnapshot(adoId, `Seed ${seed}`),
          artifactPath: `scenarios/${adoId}.scenario.yaml`,
        }],
        surfaceGraphs: [{
          artifact: createSurfaceGraph(screenId),
          artifactPath: `knowledge/surfaces/${screenId}.surface.yaml`,
        }],
        screenElements: [{
          artifact: createScreenElements(screenId),
          artifactPath: `knowledge/screens/${screenId}.elements.yaml`,
        }],
        screenPostures: [{
          artifact: createScreenPostures(screenId),
          artifactPath: `knowledge/screens/${screenId}.postures.yaml`,
        }],
        scenarios: [{
          artifact: createScenario(adoId, screenId),
          artifactPath: `scenarios/${adoId}.scenario.yaml`,
          generatedSpecPath: `generated/test-suite/${adoId}.spec.ts`,
          generatedSpecExists: false,
          generatedTracePath: `generated/test-suite/${adoId}.trace.json`,
          generatedTraceExists: false,
          generatedReviewPath: `generated/test-suite/${adoId}.review.md`,
          generatedReviewExists: false,
        }],
      });

      const graph = deriveGraph(input);
      const ids = graph.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ─── Law 2: Edge referential integrity ───

test.describe('Graph topology: edge referential integrity', () => {
  test('every edge references existing nodes in a minimal graph', () => {
    const graph = deriveGraph(buildMinimalInput());
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  test('no dangling edges across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const adoId = String(10000 + randomInt(next, 9000));
      const screenId = `screen-${randomWord(next)}`;

      const input = buildMinimalInput({
        snapshots: [{
          artifact: createSnapshot(adoId, `Seed ${seed}`),
          artifactPath: `scenarios/${adoId}.scenario.yaml`,
        }],
        surfaceGraphs: [{
          artifact: createSurfaceGraph(screenId),
          artifactPath: `knowledge/surfaces/${screenId}.surface.yaml`,
        }],
        screenElements: [{
          artifact: createScreenElements(screenId),
          artifactPath: `knowledge/screens/${screenId}.elements.yaml`,
        }],
        screenPostures: [{
          artifact: createScreenPostures(screenId),
          artifactPath: `knowledge/screens/${screenId}.postures.yaml`,
        }],
        scenarios: [{
          artifact: createScenario(adoId, screenId),
          artifactPath: `scenarios/${adoId}.scenario.yaml`,
          generatedSpecPath: `generated/test-suite/${adoId}.spec.ts`,
          generatedSpecExists: false,
          generatedTracePath: `generated/test-suite/${adoId}.trace.json`,
          generatedTraceExists: false,
          generatedReviewPath: `generated/test-suite/${adoId}.review.md`,
          generatedReviewExists: false,
        }],
      });

      const graph = deriveGraph(input);
      const nodeIds = new Set(graph.nodes.map((n) => n.id));

      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.from), `seed=${seed} edge ${edge.id} from=${edge.from} not found`).toBe(true);
        expect(nodeIds.has(edge.to), `seed=${seed} edge ${edge.id} to=${edge.to} not found`).toBe(true);
      }
    }
  });

  test('conditional edges are only resolved when required nodes exist', () => {
    const nodes = new Map([['a', { id: 'a' } as any]]);
    const conditionalEdges: readonly ConditionalEdge[] = [
      { edge: { id: 'e1', kind: 'contains', from: 'a', to: 'b', fingerprint: 'f1', provenance: {} } as any, requiredNodeIds: ['a', 'b'] },
      { edge: { id: 'e2', kind: 'contains', from: 'a', to: 'a', fingerprint: 'f2', provenance: {} } as any, requiredNodeIds: ['a'] },
    ];

    const resolved = resolveConditionalEdges(nodes, conditionalEdges);
    expect(resolved.size).toBe(1);
    expect(resolved.has('e2')).toBe(true);
    expect(resolved.has('e1')).toBe(false);
  });
});

// ─── Law 3: Acyclic containment hierarchy ───

test.describe('Graph topology: acyclic containment hierarchy', () => {
  test('containment edges form a DAG (no cycles)', () => {
    const graph = deriveGraph(buildMinimalInput());
    const containsEdges = graph.edges.filter((e) => e.kind === 'contains');

    // Build adjacency list for containment only
    const adjacency = new Map<string, readonly string[]>();
    for (const edge of containsEdges) {
      const existing = adjacency.get(edge.from) ?? [];
      adjacency.set(edge.from, [...existing, edge.to]);
    }

    // Detect cycle using DFS coloring (white/gray/black)
    const white = new Set(graph.nodes.map((n) => n.id));
    const gray = new Set<string>();
    const black = new Set<string>();

    function hasCycle(nodeId: string): boolean {
      if (black.has(nodeId)) return false;
      if (gray.has(nodeId)) return true;

      white.delete(nodeId);
      gray.add(nodeId);

      for (const neighbor of adjacency.get(nodeId) ?? []) {
        if (hasCycle(neighbor)) return true;
      }

      gray.delete(nodeId);
      black.add(nodeId);
      return false;
    }

    for (const nodeId of [...white]) {
      expect(hasCycle(nodeId), `Cycle detected involving ${nodeId}`).toBe(false);
    }
  });

  test('screen -> section -> surface -> element containment order is respected', () => {
    const graph = deriveGraph(buildMinimalInput());
    const containsEdges = graph.edges.filter((e) => e.kind === 'contains');
    const nodeKindById = new Map(graph.nodes.map((n) => [n.id, n.kind]));

    const HIERARCHY_ORDER: ReadonlyArray<string> = ['screen', 'section', 'surface', 'element', 'posture', 'capability'];

    for (const edge of containsEdges) {
      const fromKind = nodeKindById.get(edge.from);
      const toKind = nodeKindById.get(edge.to);
      if (!fromKind || !toKind) continue;

      const fromRank = HIERARCHY_ORDER.indexOf(fromKind);
      const toRank = HIERARCHY_ORDER.indexOf(toKind);

      // If both are in the hierarchy, parent rank must be strictly less than child rank
      if (fromRank >= 0 && toRank >= 0) {
        expect(fromRank < toRank, `containment ${fromKind} -> ${toKind} violates hierarchy order`).toBe(true);
      }
    }
  });
});

// ─── Law 4: Deterministic fingerprinting ───

test.describe('Graph topology: deterministic fingerprinting', () => {
  test('same inputs produce identical fingerprints', () => {
    const input = buildMinimalInput();
    const graph1 = deriveGraph(input);
    const graph2 = deriveGraph(input);

    expect(graph1.fingerprint).toBe(graph2.fingerprint);
    expect(graph1.nodes.length).toBe(graph2.nodes.length);
    expect(graph1.edges.length).toBe(graph2.edges.length);
  });

  test('inputs in different order produce identical graph fingerprint', () => {
    const screenA = 'screen-alpha';
    const screenB = 'screen-beta';

    const baseInput = buildMinimalInput();
    const inputAB: GraphBuildInput = {
      ...baseInput,
      surfaceGraphs: [
        { artifact: createSurfaceGraph(screenA), artifactPath: `knowledge/surfaces/${screenA}.surface.yaml` },
        { artifact: createSurfaceGraph(screenB), artifactPath: `knowledge/surfaces/${screenB}.surface.yaml` },
      ],
      screenElements: [
        { artifact: createScreenElements(screenA), artifactPath: `knowledge/screens/${screenA}.elements.yaml` },
        { artifact: createScreenElements(screenB), artifactPath: `knowledge/screens/${screenB}.elements.yaml` },
      ],
      screenPostures: [
        { artifact: createScreenPostures(screenA), artifactPath: `knowledge/screens/${screenA}.postures.yaml` },
        { artifact: createScreenPostures(screenB), artifactPath: `knowledge/screens/${screenB}.postures.yaml` },
      ],
    };

    const inputBA: GraphBuildInput = {
      ...baseInput,
      surfaceGraphs: [
        { artifact: createSurfaceGraph(screenB), artifactPath: `knowledge/surfaces/${screenB}.surface.yaml` },
        { artifact: createSurfaceGraph(screenA), artifactPath: `knowledge/surfaces/${screenA}.surface.yaml` },
      ],
      screenElements: [
        { artifact: createScreenElements(screenB), artifactPath: `knowledge/screens/${screenB}.elements.yaml` },
        { artifact: createScreenElements(screenA), artifactPath: `knowledge/screens/${screenA}.elements.yaml` },
      ],
      screenPostures: [
        { artifact: createScreenPostures(screenB), artifactPath: `knowledge/screens/${screenB}.postures.yaml` },
        { artifact: createScreenPostures(screenA), artifactPath: `knowledge/screens/${screenA}.postures.yaml` },
      ],
    };

    const graphAB = deriveGraph(inputAB);
    const graphBA = deriveGraph(inputBA);

    expect(graphAB.fingerprint).toBe(graphBA.fingerprint);
  });

  test('mergeAccumulators is commutative for node/edge identity', () => {
    const a: GraphAccumulator = {
      nodes: new Map([['n1', { id: 'n1', kind: 'screen', label: 'A', fingerprint: 'fa', provenance: {} } as any]]),
      edges: new Map([['e1', { id: 'e1', kind: 'contains', from: 'n1', to: 'n2', fingerprint: 'fe1', provenance: {} } as any]]),
    };
    const b: GraphAccumulator = {
      nodes: new Map([['n2', { id: 'n2', kind: 'section', label: 'B', fingerprint: 'fb', provenance: {} } as any]]),
      edges: new Map([['e2', { id: 'e2', kind: 'contains', from: 'n2', to: 'n3', fingerprint: 'fe2', provenance: {} } as any]]),
    };

    const ab = mergeAccumulators(a, b);
    const ba = mergeAccumulators(b, a);

    expect(new Set(ab.nodes.keys())).toEqual(new Set(ba.nodes.keys()));
    expect(new Set(ab.edges.keys())).toEqual(new Set(ba.edges.keys()));
  });

  test('EMPTY_GRAPH is identity for mergeAccumulators', () => {
    const a: GraphAccumulator = {
      nodes: new Map([['n1', { id: 'n1', kind: 'screen', label: 'A', fingerprint: 'fa', provenance: {} } as any]]),
      edges: new Map(),
    };

    const merged = mergeAccumulators(a, EMPTY_GRAPH);
    expect(merged.nodes.size).toBe(a.nodes.size);
    expect(merged.edges.size).toBe(a.edges.size);

    const merged2 = mergeAccumulators(EMPTY_GRAPH, a);
    expect(merged2.nodes.size).toBe(a.nodes.size);
    expect(merged2.edges.size).toBe(a.edges.size);
  });
});

// ─── Law 5: Edge uniqueness ───

test.describe('Graph topology: edge uniqueness', () => {
  test('no duplicate edge IDs in any graph', () => {
    const graph = deriveGraph(buildMinimalInput());
    const ids = graph.edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
