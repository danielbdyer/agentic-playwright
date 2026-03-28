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
