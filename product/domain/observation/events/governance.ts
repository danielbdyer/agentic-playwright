export const GOVERNANCE_EVENT_KINDS = [
  'artifact-written',
  'trust-policy-evaluated',
  'knowledge-activated',
] as const;

export interface ArtifactWrittenEvent {
  readonly path: string;
  readonly operation: 'write-text' | 'write-json' | 'ensure-dir';
}

export interface TrustPolicyEvaluatedEvent {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly confidence: number;
  readonly threshold: number;
  readonly decision: 'approved' | 'review-required' | 'blocked';
  readonly reasons: readonly string[];
  readonly trustPolicyRule: string;
}

export interface KnowledgeActivatedEvent {
  readonly proposalId: string;
  readonly screen: string;
  readonly element: string | null;
  readonly artifactPath: string;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly activatedAliases: readonly string[];
}

export interface GovernanceEventMap {
  readonly 'artifact-written': ArtifactWrittenEvent;
  readonly 'trust-policy-evaluated': TrustPolicyEvaluatedEvent;
  readonly 'knowledge-activated': KnowledgeActivatedEvent;
}
