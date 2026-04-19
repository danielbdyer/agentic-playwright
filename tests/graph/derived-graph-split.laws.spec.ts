import { expect, test } from '@playwright/test';
import {
  EMPTY_GRAPH,
  mergeAccumulators,
  resolveConditionalEdges,
  type ConditionalEdge,
  deriveGraph,
} from '../../product/domain/graph/derived-graph';
import { createNode, createEdge } from '../../product/domain/graph/derived/primitives';
import { basename, bestAliasMatches } from '../../product/domain/graph/derived/utilities';

test.describe('derived graph split invariants', () => {
  test('accumulator merge and conditional resolution stay deterministic', () => {
    const nodeA = createNode({ id: 'a', kind: 'scenario', label: 'A' });
    const nodeB = createNode({ id: 'b', kind: 'scenario', label: 'B' });
    const edge = createEdge({ kind: 'references', from: 'a', to: 'b' });
    const conditional: ConditionalEdge = { edge, requiredNodeIds: ['b'] };

    const merged = mergeAccumulators(
      EMPTY_GRAPH,
      { nodes: new Map([[nodeA.id, nodeA], [nodeB.id, nodeB]]), edges: new Map() },
    );
    const resolvedA = resolveConditionalEdges(merged.nodes, [conditional]);
    const resolvedB = resolveConditionalEdges(merged.nodes, [conditional]);

    expect([...resolvedA.values()]).toEqual([...resolvedB.values()]);
    expect(resolvedA.get(edge.id)).toEqual(edge);
  });

  test('utility projection helpers are pure and stable', () => {
    expect(basename('knowledge/screens/auth.hints.yaml')).toBe('auth.hints.yaml');
    expect(bestAliasMatches('click submit button', ['submit', 'button', 'submit button'])).toEqual(['submit button']);
  });

  test('deriveGraph remains deterministic after module split', () => {
    const input = {
      snapshots: [],
      surfaceGraphs: [],
      knowledgeSnapshots: [],
      screenElements: [],
      screenPostures: [],
      scenarios: [],
      evidence: [],
    };
    expect(deriveGraph(input as never)).toEqual(deriveGraph(input as never));
  });
});
