/**
 * Graph Queries — Algebraic Law Tests (W4.3)
 *
 * Verifies that the pure graph query functions over DerivedGraph
 * correctly implement transition discovery, reachability, shortest path,
 * and element extraction.
 *
 *   Law 1: Transition discovery — finds all and only direct screen-to-screen edges
 *   Law 2: Reachability — BFS depth bounding and completeness
 *   Law 3: Shortest path — optimality, symmetry, null on disconnected
 *   Law 4: Screen elements — containment and reference-based discovery
 *   Law 5: Empty graph — all queries return empty/null on empty input
 *   Law 6: Self-path — queryShortestPath(g, a, a) === [a]
 *
 * 150 seeds, deterministic PRNG.
 */

import { expect, test } from '@playwright/test';
import {
  queryAvailableTransitions,
  queryReachableScreens,
  queryShortestPath,
  queryScreenElements,
} from '../lib/domain/graph-queries';
import type { DerivedGraph, GraphNode, GraphEdge } from '../lib/domain/types/projection';
import type { ScreenId } from '../lib/domain/identity';
import { mulberry32, pick, randomWord, randomInt } from './support/random';

// ─── Test graph builders ───

function screenNode(id: string): GraphNode {
  return {
    id: `screen:${id}`,
    kind: 'screen',
    label: id,
    fingerprint: `fp-${id}`,
    provenance: {},
  };
}

function elementNode(id: string): GraphNode {
  return {
    id: `element:${id}`,
    kind: 'element',
    label: id,
    fingerprint: `fp-element-${id}`,
    provenance: {},
  };
}

function edge(from: string, to: string, kind: GraphEdge['kind'] = 'affects'): GraphEdge {
  return {
    id: `${kind}:${from}->${to}`,
    kind,
    from,
    to,
    fingerprint: `fp-edge-${from}-${to}`,
    provenance: {},
  };
}

function emptyGraph(): DerivedGraph {
  return {
    version: 'v1',
    fingerprint: 'empty',
    nodes: [],
    edges: [],
    resources: [],
    resourceTemplates: [],
  };
}

function makeGraph(nodes: readonly GraphNode[], edges: readonly GraphEdge[]): DerivedGraph {
  return {
    version: 'v1',
    fingerprint: 'test',
    nodes: [...nodes],
    edges: [...edges],
    resources: [],
    resourceTemplates: [],
  };
}

function sid(id: string): ScreenId {
  return id as ScreenId;
}

// ─── Standard test graphs ───

function linearGraph() {
  // A -> B -> C
  return makeGraph(
    [screenNode('A'), screenNode('B'), screenNode('C')],
    [
      edge('screen:A', 'screen:B', 'affects'),
      edge('screen:B', 'screen:C', 'affects'),
    ],
  );
}

function diamondGraph() {
  //   A
  //  / \
  // B   C
  //  \ /
  //   D
  return makeGraph(
    [screenNode('A'), screenNode('B'), screenNode('C'), screenNode('D')],
    [
      edge('screen:A', 'screen:B', 'affects'),
      edge('screen:A', 'screen:C', 'affects'),
      edge('screen:B', 'screen:D', 'affects'),
      edge('screen:C', 'screen:D', 'affects'),
    ],
  );
}

function disconnectedGraph() {
  // A -> B,  C -> D  (two components)
  return makeGraph(
    [screenNode('A'), screenNode('B'), screenNode('C'), screenNode('D')],
    [
      edge('screen:A', 'screen:B', 'affects'),
      edge('screen:C', 'screen:D', 'affects'),
    ],
  );
}

function cyclicGraph() {
  // A -> B -> C -> A
  return makeGraph(
    [screenNode('A'), screenNode('B'), screenNode('C')],
    [
      edge('screen:A', 'screen:B', 'affects'),
      edge('screen:B', 'screen:C', 'affects'),
      edge('screen:C', 'screen:A', 'affects'),
    ],
  );
}

// ─── Law 1: Transition discovery ──���

test.describe('Law 1: Transition discovery', () => {
  test('finds direct screen-to-screen transitions', () => {
    const graph = linearGraph();
    const transitions = queryAvailableTransitions(graph, sid('A'));
    expect(transitions.length).toBe(1);
    expect(transitions[0]!.toScreenId).toBe('B');
  });

  test('finds multiple transitions from a hub screen', () => {
    const graph = diamondGraph();
    const transitions = queryAvailableTransitions(graph, sid('A'));
    expect(transitions.length).toBe(2);
    const targets = transitions.map((t) => t.toScreenId).sort();
    expect(targets).toEqual(['B', 'C']);
  });

  test('returns empty for leaf screens', () => {
    const graph = linearGraph();
    const transitions = queryAvailableTransitions(graph, sid('C'));
    expect(transitions.length).toBe(0);
  });

  test('returns empty for non-existent screen', () => {
    const graph = linearGraph();
    const transitions = queryAvailableTransitions(graph, sid('Z'));
    expect(transitions.length).toBe(0);
  });

  test('returns empty on empty graph', () => {
    const transitions = queryAvailableTransitions(emptyGraph(), sid('A'));
    expect(transitions.length).toBe(0);
  });

  test('respects navigation edge kinds only', () => {
    const graph = makeGraph(
      [screenNode('A'), screenNode('B')],
      [edge('screen:A', 'screen:B', 'contains')], // contains is not navigation
    );
    const transitions = queryAvailableTransitions(graph, sid('A'));
    expect(transitions.length).toBe(0);
  });

  test('transition labels correspond to target node labels (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const sourceId = `src-${randomWord(next)}`;
      const targetId = `tgt-${randomWord(next)}`;
      const graph = makeGraph(
        [screenNode(sourceId), screenNode(targetId)],
        [edge(`screen:${sourceId}`, `screen:${targetId}`, 'affects')],
      );
      const transitions = queryAvailableTransitions(graph, sid(sourceId));
      if (transitions.length > 0) {
        expect(transitions[0]!.label).toBe(targetId);
      }
    }
  });
});

// ─── Law 2: Reachability (BFS depth bounding) ───

test.describe('Law 2: Reachability', () => {
  test('depth 0 returns nothing', () => {
    const graph = linearGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 0);
    expect(reachable.length).toBe(0);
  });

  test('depth 1 returns only direct neighbors', () => {
    const graph = linearGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 1);
    expect(reachable).toEqual(['B']);
  });

  test('depth 2 returns two-hop reachable', () => {
    const graph = linearGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 2);
    expect([...reachable].sort()).toEqual(['B', 'C']);
  });

  test('diamond: all nodes reachable from A at depth 2', () => {
    const graph = diamondGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 2);
    expect([...reachable].sort()).toEqual(['B', 'C', 'D']);
  });

  test('disconnected: cannot reach across components', () => {
    const graph = disconnectedGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 10);
    expect(reachable).toEqual(['B']);
  });

  test('starting node is not included in results', () => {
    const graph = linearGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 5);
    expect(reachable).not.toContain('A');
  });

  test('cyclic graph: does not infinite loop', () => {
    const graph = cyclicGraph();
    const reachable = queryReachableScreens(graph, sid('A'), 10);
    expect([...reachable].sort()).toEqual(['B', 'C']);
  });

  test('reachability monotonicity: depth N+1 >= depth N (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const nodeCount = 2 + randomInt(next, 5);
      const ids = Array.from({ length: nodeCount }, (_, i) => `n${i}`);
      const nodes = ids.map(screenNode);
      const edgeCount = 1 + randomInt(next, nodeCount);
      const edges = Array.from({ length: edgeCount }, () => {
        const from = pick(next, ids);
        const to = pick(next, ids);
        return edge(`screen:${from}`, `screen:${to}`, 'affects');
      });
      const graph = makeGraph(nodes, edges);
      const startId = pick(next, ids);

      const r1 = queryReachableScreens(graph, sid(startId), 1);
      const r2 = queryReachableScreens(graph, sid(startId), 2);
      const r5 = queryReachableScreens(graph, sid(startId), 5);

      expect(r2.length).toBeGreaterThanOrEqual(r1.length);
      expect(r5.length).toBeGreaterThanOrEqual(r2.length);
    }
  });
});

// ─── Law 3: Shortest path ──���

test.describe('Law 3: Shortest path', () => {
  test('self-path returns single element', () => {
    const graph = linearGraph();
    const path = queryShortestPath(graph, sid('A'), sid('A'));
    expect(path).toEqual(['A']);
  });

  test('direct neighbor path has length 2', () => {
    const graph = linearGraph();
    const path = queryShortestPath(graph, sid('A'), sid('B'));
    expect(path).toEqual(['A', 'B']);
  });

  test('two-hop path in linear graph', () => {
    const graph = linearGraph();
    const path = queryShortestPath(graph, sid('A'), sid('C'));
    expect(path).toEqual(['A', 'B', 'C']);
  });

  test('diamond: shortest path A->D has length 3', () => {
    const graph = diamondGraph();
    const path = queryShortestPath(graph, sid('A'), sid('D'));
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
    expect(path![0]).toBe('A');
    expect(path![path!.length - 1]).toBe('D');
  });

  test('disconnected: returns null for unreachable target', () => {
    const graph = disconnectedGraph();
    const path = queryShortestPath(graph, sid('A'), sid('D'));
    expect(path).toBeNull();
  });

  test('non-existent source returns null', () => {
    const graph = linearGraph();
    const path = queryShortestPath(graph, sid('Z'), sid('A'));
    expect(path).toBeNull();
  });

  test('non-existent target returns null', () => {
    const graph = linearGraph();
    const path = queryShortestPath(graph, sid('A'), sid('Z'));
    expect(path).toBeNull();
  });

  test('empty graph returns null', () => {
    const path = queryShortestPath(emptyGraph(), sid('A'), sid('B'));
    expect(path).toBeNull();
  });

  test('path is actually a valid walk (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const nodeCount = 2 + randomInt(next, 6);
      const ids = Array.from({ length: nodeCount }, (_, i) => `n${i}`);
      const nodes = ids.map(screenNode);
      const edgeCount = 1 + randomInt(next, nodeCount * 2);
      const edges = Array.from({ length: edgeCount }, () => {
        const from = pick(next, ids);
        const to = pick(next, ids);
        return edge(`screen:${from}`, `screen:${to}`, 'affects');
      });
      const graph = makeGraph(nodes, edges);
      const from = pick(next, ids);
      const to = pick(next, ids);

      const path = queryShortestPath(graph, sid(from), sid(to));
      if (path !== null && path.length > 1) {
        // Verify each consecutive pair has a navigation edge
        const edgeSet = new Set(edges.map((e) => `${e.from}->${e.to}`));
        for (let i = 0; i < path.length - 1; i++) {
          const fromNode = `screen:${path[i]}`;
          const toNode = `screen:${path[i + 1]}`;
          expect(edgeSet.has(`${fromNode}->${toNode}`)).toBe(true);
        }
      }
    }
  });
});

// ─── Law 4: Screen elements ───

test.describe('Law 4: Screen elements', () => {
  test('finds elements contained by a screen', () => {
    const graph = makeGraph(
      [screenNode('login'), elementNode('username'), elementNode('password')],
      [
        edge('screen:login', 'element:username', 'contains'),
        edge('screen:login', 'element:password', 'contains'),
      ],
    );
    const elements = queryScreenElements(graph, sid('login'));
    expect(elements.length).toBe(2);
    const labels = elements.map((e) => e.label).sort();
    expect(labels).toEqual(['password', 'username']);
  });

  test('finds elements referencing a screen', () => {
    const graph = makeGraph(
      [screenNode('dashboard'), elementNode('sidebar')],
      [edge('element:sidebar', 'screen:dashboard', 'references')],
    );
    const elements = queryScreenElements(graph, sid('dashboard'));
    expect(elements.length).toBe(1);
    expect(elements[0]!.label).toBe('sidebar');
  });

  test('deduplicates elements found via both containment and reference', () => {
    const graph = makeGraph(
      [screenNode('form'), elementNode('submit')],
      [
        edge('screen:form', 'element:submit', 'contains'),
        edge('element:submit', 'screen:form', 'references'),
      ],
    );
    const elements = queryScreenElements(graph, sid('form'));
    expect(elements.length).toBe(1);
  });

  test('returns empty for screen with no elements', () => {
    const graph = makeGraph([screenNode('empty')], []);
    const elements = queryScreenElements(graph, sid('empty'));
    expect(elements.length).toBe(0);
  });

  test('returns empty for non-existent screen', () => {
    const graph = makeGraph([screenNode('real')], []);
    const elements = queryScreenElements(graph, sid('missing'));
    expect(elements.length).toBe(0);
  });

  test('element descriptors have correct shape (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const screenName = `screen-${randomWord(next)}`;
      const elementCount = 1 + randomInt(next, 4);
      const elementNames = Array.from(
        { length: elementCount },
        (_, i) => `elem-${i}-${randomWord(next)}`,
      );
      const nodes = [
        screenNode(screenName),
        ...elementNames.map(elementNode),
      ];
      const edges = elementNames.map((name) =>
        edge(`screen:${screenName}`, `element:${name}`, 'contains'),
      );
      const graph = makeGraph(nodes, edges);
      const elements = queryScreenElements(graph, sid(screenName));

      expect(elements.length).toBe(elementCount);
      for (const elem of elements) {
        expect(typeof elem.nodeId).toBe('string');
        expect(typeof elem.label).toBe('string');
        expect(elem.kind).toBe('element');
      }
    }
  });
});

// ─── Law 5: Empty graph invariants ───

test.describe('Law 5: Empty graph invariants', () => {
  test('all queries return empty/null on empty graph', () => {
    const g = emptyGraph();
    expect(queryAvailableTransitions(g, sid('A'))).toEqual([]);
    expect(queryReachableScreens(g, sid('A'), 5)).toEqual([]);
    expect(queryShortestPath(g, sid('A'), sid('B'))).toBeNull();
    expect(queryScreenElements(g, sid('A'))).toEqual([]);
  });
});

// ──�� Law 6: Cyclic graph safety ───

test.describe('Law 6: Cyclic graph safety', () => {
  test('shortest path terminates in cyclic graph', () => {
    const graph = cyclicGraph();
    const path = queryShortestPath(graph, sid('A'), sid('C'));
    expect(path).toEqual(['A', 'B', 'C']);
  });

  test('elements query terminates in cyclic graph', () => {
    const graph = cyclicGraph();
    const elements = queryScreenElements(graph, sid('A'));
    expect(elements).toEqual([]); // no element nodes in cyclic graph
  });
});
