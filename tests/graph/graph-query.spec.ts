import { expect, test } from '@playwright/test';
import { collectImpactSubgraph } from '../../product/domain/graph/graph-query';
import type { DerivedGraph } from '../../product/domain/projection/types';

function node(id: string, kind: DerivedGraph['nodes'][number]['kind']) {
  return {
    id,
    kind,
    label: id,
    fingerprint: id,
    provenance: {},
  };
}

function edge(id: string, kind: DerivedGraph['edges'][number]['kind'], from: string, to: string) {
  return {
    id,
    kind,
    from,
    to,
    fingerprint: id,
    provenance: {},
  };
}

test('collectImpactSubgraph follows dependency direction instead of expanding through sibling containment', () => {
  const graph: DerivedGraph = {
    version: 'v1',
    fingerprint: 'graph',
    resources: [],
    resourceTemplates: [],
    nodes: [
      node('element:A', 'element'),
      node('element:B', 'element'),
      node('step:1', 'step'),
      node('step:2', 'step'),
      node('scenario:1', 'scenario'),
      node('generated-spec:1', 'generated-spec'),
    ],
    edges: [
      edge('uses:step1', 'uses', 'step:1', 'element:A'),
      edge('uses:step2', 'uses', 'step:2', 'element:B'),
      edge('contains:scenario-step1', 'contains', 'scenario:1', 'step:1'),
      edge('contains:scenario-step2', 'contains', 'scenario:1', 'step:2'),
      edge('emits:scenario-spec', 'emits', 'scenario:1', 'generated-spec:1'),
    ],
  };

  const impact = collectImpactSubgraph(graph, 'element:A');
  const impactedNodeIds = impact.nodes.map((entry) => entry.id).sort((left, right) => left.localeCompare(right));

  expect(impactedNodeIds).toEqual([
    'element:A',
    'generated-spec:1',
    'scenario:1',
    'step:1',
  ]);
});
