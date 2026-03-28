export interface ObservedRoute {
  readonly url: string;
  readonly screenId: string;
  readonly observedAt: string;
  readonly stepIndex: number;
  readonly navigationAction: string;
}

export interface RoutePattern {
  readonly pattern: string;
  readonly screenId: string;
  readonly parameterNames: readonly string[];
  readonly exampleUrls: readonly string[];
  readonly observationCount: number;
}

export interface RouteKnowledgeProposal {
  readonly kind: 'route-knowledge-proposal';
  readonly screenId: string;
  readonly pattern: RoutePattern;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reason: string;
  readonly suggestedPath: string;
}

export type RouteVariantDimension = 'query' | 'hash' | 'tab' | 'segment';

export interface RouteVariantKnowledge {
  readonly routeVariantRef: string;
  readonly screenId: string;
  readonly url: string;
  readonly urlPattern: string;
  readonly dimensions: readonly RouteVariantDimension[];
  readonly expectedEntryStateRefs: readonly string[];
  readonly historicalSuccess: {
    readonly successCount: number;
    readonly failureCount: number;
    readonly lastSuccessAt?: string | null | undefined;
  };
}

export interface RouteVariantSelectionInput {
  readonly screenId: string;
  readonly semanticDestination: string;
  readonly expectedEntryStateRefs: readonly string[];
}

export interface RankedRouteVariant {
  readonly variant: RouteVariantKnowledge;
  readonly specificityScore: number;
  readonly historicalSuccessScore: number;
  readonly semanticScore: number;
  readonly entryStateScore: number;
  readonly score: number;
  readonly rationale: string;
}
