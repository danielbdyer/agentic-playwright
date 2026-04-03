import { useQuery } from '@tanstack/react-query';
import type { KnowledgeNode, KnowledgeNodeStatus, ActorKind, Governance } from '../../../spatial/types';
import type { Scorecard, Workbench } from '../../../types';

export const useWorkbenchData = () => useQuery<Workbench | null>({
  queryKey: ['workbench'],
  queryFn: async () => {
    const response = await fetch('/api/workbench');
    return response.ok ? response.json() : null;
  },
  refetchInterval: 15000,
  staleTime: 5000,
});

export const useFitnessData = () => useQuery<Scorecard | null>({
  queryKey: ['fitness'],
  queryFn: async () => {
    const response = await fetch('/api/fitness');
    return response.ok ? response.json() : null;
  },
  refetchInterval: 30000,
  staleTime: 10000,
});

export const useKnowledgeNodesData = () => useQuery<readonly KnowledgeNode[]>({
  queryKey: ['knowledge-nodes'],
  queryFn: async () => {
    const response = await fetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'get_knowledge_state', arguments: {} }),
    });
    if (!response.ok) return [];

    const result = await response.json();
    const nodes = result?.result?.nodes ?? [];
    return nodes.flatMap((node: Record<string, unknown>) => {
      const id = String(node.id ?? '');
      const parts = id.split('/');
      if (parts.length < 2) {
        return [];
      }

      return [{
        screen: parts[0] ?? 'unknown',
        element: parts.slice(1).join('/'),
        confidence: typeof node.confidence === 'number' ? node.confidence : 0.5,
        aliases: Array.isArray(node.aliases) ? node.aliases : [],
        status: (node.status as KnowledgeNodeStatus) ?? 'learning',
        lastActor: (node.lastActor as ActorKind) ?? 'system',
        governance: (node.governance as Governance) ?? 'approved',
      }];
    });
  },
  refetchInterval: 20000,
  staleTime: 10000,
});
