/**
 * Knowledge Contradiction Detection types (N1.10)
 *
 * Domain types for detecting conflicting hints, routes, and patterns
 * across the knowledge base.
 */

export type ContradictionSeverity = 'error' | 'warning' | 'info';

export type ContradictionCategory =
  | 'locator-conflict'
  | 'route-conflict'
  | 'pattern-conflict'
  | 'hint-conflict'
  | 'screen-identity-conflict';

export interface KnowledgeContradiction {
  readonly id: string;
  readonly category: ContradictionCategory;
  readonly severity: ContradictionSeverity;
  readonly description: string;
  readonly sources: readonly ContradictionSource[];
  readonly suggestedResolution: string;
}

export interface ContradictionSource {
  readonly file: string;
  readonly field: string;
  readonly value: string;
}

export interface ContradictionReport {
  readonly kind: 'contradiction-report';
  readonly version: 1;
  readonly generatedAt: string;
  readonly contradictions: readonly KnowledgeContradiction[];
  readonly summary: ContradictionSummary;
}

export interface ContradictionSummary {
  readonly totalContradictions: number;
  readonly byCategory: Readonly<Record<ContradictionCategory, number>>;
  readonly bySeverity: Readonly<Record<ContradictionSeverity, number>>;
  readonly blocksPromotion: boolean;
}
