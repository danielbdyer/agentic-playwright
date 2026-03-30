/**
 * W2.10 — Cross-graph consistency validation
 *
 * Laws verified:
 * 1. Consistent graphs produce no violations
 * 2. Graphs with dangling edge refs produce violations
 * 3. Validation is deterministic (same input -> same output, 150 seeds)
 * 4. Empty graphs are trivially consistent
 * 5. Missing screen cross-references produce violations
 * 6. Missing element cross-references produce violations
 */

import { expect, test } from '@playwright/test';
import {
  validateGraphConsistency,
} from '../lib/domain/graph-validation';
import type { ApplicationInterfaceGraph, InterfaceGraphNode, InterfaceGraphEdge } from '../lib/domain/types/interface';
import type { DerivedGraph, GraphNode, GraphEdge } from '../lib/domain/types/projection';
import { mulberry32, randomWord, randomInt } from './support/random';

// ─── Factories ───

function makeInterfaceNode(overrides: Partial<InterfaceGraphNode> & { readonly id: string; readonly kind: InterfaceGraphNode['kind'] }): InterfaceGraphNode {
  return {
    label: overrides.id,
    fingerprint: `fp:${overrides.id}`,
    artifactPaths: [],
    source: 'approved-knowledge',
    ...overrides,
  };
}

function makeInterfaceEdge(overrides: Partial<InterfaceGraphEdge> & { readonly from: string; readonly to: string }): InterfaceGraphEdge {
  const id = overrides.id ?? `${overrides.from}->${overrides.to}`;
  return {
    id,
    kind: 'contains',
    fingerprint: `fp:${id}`,
    lineage: [],
    ...overrides,
  };
}

function makeDerivedNode(overrides: Partial<GraphNode> & { readonly id: string; readonly kind: GraphNode['kind'] }): GraphNode {
  return {
    label: overrides.id,
    fingerprint: `fp:${overrides.id}`,
    provenance: {},
    ...overrides,
  };
}

function makeDerivedEdge(overrides: Partial<GraphEdge> & { readonly from: string; readonly to: string }): GraphEdge {
  const id = overrides.id ?? `${overrides.from}->${overrides.to}`;
  return {
    id,
    kind: 'contains',
    fingerprint: `fp:${id}`,
    provenance: {},
    ...overrides,
  };
}

function makeAppGraph(
  nodes: readonly InterfaceGraphNode[],
  edges: readonly InterfaceGraphEdge[] = [],
): ApplicationInterfaceGraph {
  return {
    kind: 'application-interface-graph',
    version: 2,
    generatedAt: '2026-01-01T00:00:00.000Z',
    fingerprint: 'test-fp',
    discoveryRunIds: [],
    routeRefs: [],
    routeVariantRefs: [],
    targetRefs: [],
    stateRefs: [],
    eventSignatureRefs: [],
    transitionRefs: [],
    nodes,
    edges,
  };
}

function makeDerivedGraph(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[] = [],
): DerivedGraph {
  return {
    version: 'v1',
    fingerprint: 'test-fp',
    nodes,
    edges,
    resources: [],
    resourceTemplates: [],
  };
}

// ─── Consistent pair factory ───

function buildConsistentPair(screenId: string) {
  const screenNodeId = `screen:${screenId}`;
  const sectionNodeId = `section:${screenId}:main`;
  const surfaceNodeId = `surface:${screenId}:form`;
  const elementNodeId = `element:${screenId}:field1`;

  const appGraph = makeAppGraph(
    [
      makeInterfaceNode({ id: screenNodeId, kind: 'screen', screen: screenId as any }),
      makeInterfaceNode({ id: `section:${screenId}:main`, kind: 'section', screen: screenId as any }),
    ],
    [
      makeInterfaceEdge({ from: screenNodeId, to: `section:${screenId}:main`, kind: 'contains' }),
    ],
  );

  const derivedGraph = makeDerivedGraph(
    [
      makeDerivedNode({ id: screenNodeId, kind: 'screen' }),
      makeDerivedNode({ id: sectionNodeId, kind: 'section' }),
      makeDerivedNode({ id: surfaceNodeId, kind: 'surface' }),
      makeDerivedNode({ id: elementNodeId, kind: 'element' }),
    ],
    [
      makeDerivedEdge({ from: screenNodeId, to: sectionNodeId, kind: 'contains' }),
      makeDerivedEdge({ from: sectionNodeId, to: surfaceNodeId, kind: 'contains' }),
      makeDerivedEdge({ from: surfaceNodeId, to: elementNodeId, kind: 'contains' }),
    ],
  );

  return { appGraph, derivedGraph };
}

// ─── Law 1: Consistent graphs produce no violations ───

test.describe('Cross-graph consistency: consistent graphs', () => {
  test('consistent graphs produce zero violations', () => {
    const { appGraph, derivedGraph } = buildConsistentPair('login');
    const violations = validateGraphConsistency(appGraph, derivedGraph);
    expect(violations).toEqual([]);
  });

  test('multiple screens, all consistent, produce zero violations', () => {
    const screens = ['login', 'dashboard', 'settings'];
    const pairs = screens.map(buildConsistentPair);

    const appGraph = makeAppGraph(
      pairs.flatMap((p) => p.appGraph.nodes),
      pairs.flatMap((p) => p.appGraph.edges),
    );
    const derivedGraph = makeDerivedGraph(
      pairs.flatMap((p) => p.derivedGraph.nodes),
      pairs.flatMap((p) => p.derivedGraph.edges),
    );

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    expect(violations).toEqual([]);
  });
});

// ─── Law 2: Dangling edge refs produce violations ───

test.describe('Cross-graph consistency: dangling edges', () => {
  test('dangling edge.from in DerivedGraph produces violation', () => {
    const appGraph = makeAppGraph([]);
    const node = makeDerivedNode({ id: 'screen:test', kind: 'screen' });
    const derivedGraph = makeDerivedGraph(
      [node],
      [makeDerivedEdge({ from: 'nonexistent-node', to: 'screen:test' })],
    );

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const dangling = violations.filter((v) => v.kind === 'dangling-edge-from');
    expect(dangling.length).toBeGreaterThanOrEqual(1);
    expect(dangling[0]!.graph).toBe('derived');
    expect(dangling[0]!.nodeId).toBe('nonexistent-node');
  });

  test('dangling edge.to in DerivedGraph produces violation', () => {
    const appGraph = makeAppGraph([]);
    const node = makeDerivedNode({ id: 'screen:test', kind: 'screen' });
    const derivedGraph = makeDerivedGraph(
      [node],
      [makeDerivedEdge({ from: 'screen:test', to: 'ghost-node' })],
    );

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const dangling = violations.filter((v) => v.kind === 'dangling-edge-to');
    expect(dangling.length).toBeGreaterThanOrEqual(1);
    expect(dangling[0]!.nodeId).toBe('ghost-node');
  });

  test('dangling edge in ApplicationInterfaceGraph produces violation', () => {
    const appGraph = makeAppGraph(
      [makeInterfaceNode({ id: 'screen:test', kind: 'screen' })],
      [makeInterfaceEdge({ from: 'screen:test', to: 'missing-section' })],
    );
    const derivedGraph = makeDerivedGraph(
      [makeDerivedNode({ id: 'screen:test', kind: 'screen' })],
    );

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const dangling = violations.filter((v) => v.kind === 'dangling-edge-to' && v.graph === 'interface');
    expect(dangling.length).toBeGreaterThanOrEqual(1);
  });

  test('both from and to dangling produces two violations for one edge', () => {
    const appGraph = makeAppGraph([]);
    const derivedGraph = makeDerivedGraph(
      [],
      [makeDerivedEdge({ from: 'ghost-a', to: 'ghost-b' })],
    );

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const edgeViolations = violations.filter(
      (v) => v.kind === 'dangling-edge-from' || v.kind === 'dangling-edge-to',
    );
    expect(edgeViolations.length).toBe(2);
  });
});

// ─── Law 3: Deterministic validation (150 seeds) ───

test.describe('Cross-graph consistency: determinism', () => {
  test('same input produces identical violations across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const screenCount = 1 + randomInt(next, 4);
      const screens = Array.from({ length: screenCount }, () => `screen-${randomWord(next)}`);

      // Build derived graph with all screens
      const derivedNodes: GraphNode[] = screens.flatMap((s) => [
        makeDerivedNode({ id: `screen:${s}`, kind: 'screen' }),
        makeDerivedNode({ id: `element:${s}:field`, kind: 'element' }),
      ]);
      const derivedEdges: GraphEdge[] = screens.map((s) =>
        makeDerivedEdge({ from: `screen:${s}`, to: `element:${s}:field`, kind: 'contains' }),
      );

      // Build interface graph with a random subset of screens (may omit some)
      const includedScreens = screens.filter(() => next() > 0.3);
      const interfaceNodes: InterfaceGraphNode[] = includedScreens.map((s) =>
        makeInterfaceNode({ id: `screen:${s}`, kind: 'screen', screen: s as any }),
      );

      const appGraph = makeAppGraph(interfaceNodes);
      const derivedGraph = makeDerivedGraph(derivedNodes, derivedEdges);

      const run1 = validateGraphConsistency(appGraph, derivedGraph);
      const run2 = validateGraphConsistency(appGraph, derivedGraph);

      expect(run1.length).toBe(run2.length);
      run1.forEach((v, i) => {
        expect(v.kind).toBe(run2[i]!.kind);
        expect(v.nodeId).toBe(run2[i]!.nodeId);
        expect(v.message).toBe(run2[i]!.message);
      });
    }
  });
});

// ─── Law 4: Empty graphs are trivially consistent ───

test.describe('Cross-graph consistency: empty graphs', () => {
  test('two empty graphs produce no violations', () => {
    const violations = validateGraphConsistency(
      makeAppGraph([]),
      makeDerivedGraph([]),
    );
    expect(violations).toEqual([]);
  });

  test('empty interface graph with empty derived graph is consistent', () => {
    const violations = validateGraphConsistency(
      makeAppGraph([], []),
      makeDerivedGraph([], []),
    );
    expect(violations).toEqual([]);
  });
});

// ─── Law 5: Missing screen cross-references ───

test.describe('Cross-graph consistency: screen cross-references', () => {
  test('screen in DerivedGraph but not in InterfaceGraph produces violation', () => {
    const appGraph = makeAppGraph([]);
    const derivedGraph = makeDerivedGraph([
      makeDerivedNode({ id: 'screen:orphan', kind: 'screen' }),
    ]);

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const screenViolations = violations.filter((v) => v.kind === 'screen-missing-in-interface-graph');
    expect(screenViolations.length).toBe(1);
    expect(screenViolations[0]!.nodeId).toBe('screen:orphan');
  });

  test('screen in InterfaceGraph but not in DerivedGraph produces violation', () => {
    const appGraph = makeAppGraph([
      makeInterfaceNode({ id: 'screen:lonely', kind: 'screen', screen: 'lonely' as any }),
    ]);
    const derivedGraph = makeDerivedGraph([]);

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const screenViolations = violations.filter((v) => v.kind === 'screen-missing-in-derived-graph');
    expect(screenViolations.length).toBe(1);
    expect(screenViolations[0]!.nodeId).toBe('screen:lonely');
  });

  test('partial screen overlap reports only mismatched screens', () => {
    const appGraph = makeAppGraph([
      makeInterfaceNode({ id: 'screen:shared', kind: 'screen' }),
      makeInterfaceNode({ id: 'screen:only-interface', kind: 'screen' }),
    ]);
    const derivedGraph = makeDerivedGraph([
      makeDerivedNode({ id: 'screen:shared', kind: 'screen' }),
      makeDerivedNode({ id: 'screen:only-derived', kind: 'screen' }),
    ]);

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const missingInInterface = violations.filter((v) => v.kind === 'screen-missing-in-interface-graph');
    const missingInDerived = violations.filter((v) => v.kind === 'screen-missing-in-derived-graph');

    expect(missingInInterface.length).toBe(1);
    expect(missingInInterface[0]!.nodeId).toBe('screen:only-derived');
    expect(missingInDerived.length).toBe(1);
    expect(missingInDerived[0]!.nodeId).toBe('screen:only-interface');
  });
});

// ─── Law 6: Missing element cross-references ───

test.describe('Cross-graph consistency: element cross-references', () => {
  test('element whose parent screen is missing from InterfaceGraph produces violation', () => {
    const appGraph = makeAppGraph([]);
    const derivedGraph = makeDerivedGraph([
      makeDerivedNode({ id: 'screen:missing', kind: 'screen' }),
      makeDerivedNode({ id: 'element:missing:field', kind: 'element' }),
    ]);

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const elementViolations = violations.filter((v) => v.kind === 'element-missing-in-interface-graph');
    expect(elementViolations.length).toBe(1);
    expect(elementViolations[0]!.nodeId).toBe('element:missing:field');
  });

  test('element whose parent screen exists in InterfaceGraph produces no element violation', () => {
    const appGraph = makeAppGraph([
      makeInterfaceNode({ id: 'screen:present', kind: 'screen' }),
    ]);
    const derivedGraph = makeDerivedGraph([
      makeDerivedNode({ id: 'screen:present', kind: 'screen' }),
      makeDerivedNode({ id: 'element:present:field', kind: 'element' }),
    ]);

    const violations = validateGraphConsistency(appGraph, derivedGraph);
    const elementViolations = violations.filter((v) => v.kind === 'element-missing-in-interface-graph');
    expect(elementViolations).toEqual([]);
  });
});
