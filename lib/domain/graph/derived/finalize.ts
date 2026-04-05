import { sortByStringKey } from '../../kernel/collections';
import { sha256, stableStringify } from '../../kernel/hash';
import { graphIds, mcpUris } from '../../kernel/ids';
import { createElementId, createSurfaceId } from '../../kernel/identity';
import type { ScreenId } from '../../kernel/identity';
import type { DerivedCapability } from '../../governance/workflow-types';
import type { DerivedGraph, MappedMcpResource, MappedMcpTemplate } from '../../projection/types';
import type { GraphAccumulator } from './primitives';

function createResources(): MappedMcpResource[] {
  return [
    {
      uri: mcpUris.graph,
      description: 'Derived dependency and provenance graph for the current workspace.',
    },
  ];
}

function createResourceTemplates(): MappedMcpTemplate[] {
  return [
    {
      uriTemplate: mcpUris.screenTemplate,
      description: 'Approved surface graph, elements, postures, and derived capabilities for one screen.',
    },
    {
      uriTemplate: mcpUris.scenarioTemplate,
      description: 'Scenario trace view for one ADO case.',
    },
    {
      uriTemplate: mcpUris.impactTemplate,
      description: 'Impact graph view for a graph node id.',
    },
  ];
}

function sortGraph(graph: Omit<DerivedGraph, 'fingerprint'>): DerivedGraph {
  const nodes = sortByStringKey(graph.nodes, (n) => n.id);
  const edges = sortByStringKey(graph.edges, (e) => e.id);
  const resources = sortByStringKey(graph.resources, (r) => r.uri);
  const resourceTemplates = sortByStringKey(graph.resourceTemplates, (r) => r.uriTemplate);
  return {
    ...graph,
    nodes,
    edges,
    resources,
    resourceTemplates,
    fingerprint: sha256(stableStringify({ nodes, edges, resources, resourceTemplates })),
  };
}

export function finalize(acc: GraphAccumulator): DerivedGraph {
  return sortGraph({
    version: 'v1',
    nodes: [...acc.nodes.values()],
    edges: [...acc.edges.values()],
    resources: createResources(),
    resourceTemplates: createResourceTemplates(),
  });
}

export function capabilityTargetNodeId(screenId: ScreenId, capability: DerivedCapability): string {
  switch (capability.targetKind) {
    case 'screen':
      return graphIds.screen(screenId);
    case 'surface':
      return graphIds.surface(screenId, capability.target as ReturnType<typeof createSurfaceId>);
    case 'element':
    default:
      return graphIds.element(screenId, capability.target as ReturnType<typeof createElementId>);
  }
}
