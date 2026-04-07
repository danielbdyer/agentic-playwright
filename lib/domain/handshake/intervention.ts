import type { DiagnosticSeverity, Governance, WorkflowEnvelopeIds } from '../governance/workflow-types';

export type ParticipantKind =
  | 'agent'
  | 'operator'
  | 'system'
  | 'benchmark-runner'
  | 'reviewer'
  | 'optimizer';

export type ParticipantCapability =
  | 'orient-workspace'
  | 'inspect-artifacts'
  | 'discover-surfaces'
  | 'record-observations'
  | 'propose-fragments'
  | 'approve-proposals'
  | 'reject-proposals'
  | 'request-reruns'
  | 'review-execution'
  | 'run-benchmarks'
  | 'replay-runs'
  | 'optimize-pipeline';

export interface ParticipantRef {
  readonly participantId: string;
  readonly kind: ParticipantKind;
}

export interface Participant {
  readonly participantId: string;
  readonly kind: ParticipantKind;
  readonly label: string;
  readonly providerId?: string | null | undefined;
  readonly adapterId?: string | null | undefined;
  readonly capabilities: readonly ParticipantCapability[];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type InterventionKind =
  | 'orientation'
  | 'artifact-inspection'
  | 'discovery-request'
  | 'observation-recorded'
  | 'spec-fragment-proposed'
  | 'proposal-approved'
  | 'proposal-rejected'
  | 'rerun-requested'
  | 'execution-reviewed'
  | 'benchmark-action'
  | 'replay-action'
  | 'operator-action'
  | 'self-improvement-action';

export type InterventionStatus = 'planned' | 'completed' | 'blocked' | 'skipped';
export type InterventionParticipationMode = 'inspect' | 'interpret' | 'verify' | 'choose' | 'approve' | 'enrich' | 'defer';
export type InterventionBlockageType =
  | 'target-ambiguity'
  | 'locator-degradation'
  | 'route-uncertainty'
  | 'policy-block'
  | 'recovery-gap'
  | 'execution-review'
  | 'knowledge-gap'
  | 'self-improvement'
  | 'unknown';
export type InterventionEpistemicStatus = 'observed' | 'interpreted' | 'review-required' | 'approved' | 'blocked' | 'informational';
export type InterventionBlastRadius = 'local' | 'review-bound' | 'global' | 'irreversible';
export type InterventionDriftStatus = 'preserved' | 'drift-detected' | 'unknown';
export type InterventionAuthority =
  | 'approve-canonical-change'
  | 'request-rerun'
  | 'promote-shared-pattern'
  | 'change-pipeline'
  | 'defer-work-item';
export type InterventionStalenessStatus = 'fresh' | 'aging' | 'stale';

export type InterventionTargetKind =
  | 'workspace'
  | 'suite'
  | 'scenario'
  | 'run'
  | 'step'
  | 'artifact'
  | 'graph-node'
  | 'selector'
  | 'proposal'
  | 'knowledge'
  | 'session'
  | 'benchmark'
  | 'codebase';

export interface InterventionTarget {
  readonly kind: InterventionTargetKind;
  readonly ref: string;
  readonly label: string;
  readonly artifactPath?: string | null | undefined;
  readonly ids?: WorkflowEnvelopeIds | undefined;
}

export interface InterventionPlan {
  readonly summary: string;
  readonly governance: Governance;
  readonly target: InterventionTarget;
  readonly expectedArtifactPaths: readonly string[];
}

export type InterventionEffectKind =
  | 'artifact-inspected'
  | 'artifact-written'
  | 'proposal-generated'
  | 'proposal-reviewed'
  | 'proposal-applied'
  | 'rerun-requested'
  | 'benchmark-scored'
  | 'replay-recorded'
  | 'learning-read'
  | 'execution-reviewed'
  | 'signal-emitted'
  | 'no-op';

export interface InterventionEffect {
  readonly kind: InterventionEffectKind;
  readonly severity: DiagnosticSeverity;
  readonly summary: string;
  readonly target: InterventionTarget;
  readonly artifactPath?: string | null | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface InterventionEvidenceSlice {
  readonly artifactPaths: readonly string[];
  readonly summaries: readonly string[];
}

export interface InterventionSemanticCore {
  readonly token: string;
  readonly summary: string;
  readonly driftStatus: InterventionDriftStatus;
}

export interface InterventionStaleness {
  readonly observedAt: string;
  readonly reviewBy?: string | null | undefined;
  readonly status: InterventionStalenessStatus;
  readonly rationale?: string | null | undefined;
}

export interface InterventionNextMove {
  readonly action: string;
  readonly rationale: string;
  readonly command?: string | null | undefined;
}

export interface InterventionCompetingCandidate {
  readonly ref: string;
  readonly summary: string;
  readonly source: string;
  readonly status: InterventionEpistemicStatus;
}

export interface InterventionTokenImpact {
  readonly payloadSizeBytes: number;
  readonly estimatedReadTokens: number;
  readonly ambiguityReduction?: number | null | undefined;
  readonly suspensionAvoided?: boolean | null | undefined;
  readonly rungImprovement?: number | null | undefined;
  readonly activationQuality?: number | null | undefined;
}

export interface InterventionHandoffChain {
  readonly depth: number;
  readonly previousSemanticToken?: string | null | undefined;
  readonly semanticCorePreserved: boolean;
  readonly driftDetectable: boolean;
  readonly competingCandidateCount: number;
}

export interface InterventionHandoff {
  readonly unresolvedIntent: string;
  readonly attemptedStrategies: readonly string[];
  readonly evidenceSlice: InterventionEvidenceSlice;
  readonly blockageType: InterventionBlockageType;
  readonly requestedParticipation: InterventionParticipationMode;
  readonly requiredCapabilities?: readonly ParticipantCapability[] | undefined;
  readonly requiredAuthorities?: readonly InterventionAuthority[] | undefined;
  readonly blastRadius: InterventionBlastRadius;
  readonly epistemicStatus: InterventionEpistemicStatus;
  readonly semanticCore: InterventionSemanticCore;
  readonly staleness?: InterventionStaleness | null | undefined;
  readonly nextMoves?: readonly InterventionNextMove[] | undefined;
  readonly competingCandidates?: readonly InterventionCompetingCandidate[] | undefined;
  readonly tokenImpact?: InterventionTokenImpact | null | undefined;
  readonly chain?: InterventionHandoffChain | null | undefined;
}

export interface InterventionReceipt {
  readonly interventionId: string;
  readonly kind: InterventionKind;
  readonly status: InterventionStatus;
  readonly summary: string;
  readonly participantRefs: readonly ParticipantRef[];
  readonly ids?: WorkflowEnvelopeIds | undefined;
  readonly target: InterventionTarget;
  readonly plan?: InterventionPlan | null | undefined;
  readonly effects: readonly InterventionEffect[];
  readonly handoff?: InterventionHandoff | null | undefined;
  readonly startedAt: string;
  readonly completedAt?: string | null | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
}

export type InterventionCommandActionKind =
  | 'approve-proposal'
  | 'promote-pattern'
  | 'rerun-scope'
  | 'suppress-hotspot';

export interface InterventionActionDependency {
  readonly actionId: string;
  readonly required: boolean;
  readonly reason: string;
}

export interface ReversibleMetadata {
  readonly reversible: boolean;
  readonly rollbackCommand?: string | null | undefined;
  readonly rollbackRef?: string | null | undefined;
}

export interface InterventionCommandAction {
  readonly actionId: string;
  readonly kind: InterventionCommandActionKind;
  readonly summary: string;
  readonly governance: Governance;
  readonly target: InterventionTarget;
  readonly prerequisites: readonly InterventionActionDependency[];
  readonly reversible: ReversibleMetadata;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface InterventionCommandBatch {
  readonly batchId: string;
  readonly summary: string;
  readonly actions: readonly InterventionCommandAction[];
  readonly continueOnFailure: boolean;
}

export interface InterventionLineageProjection {
  readonly kind: 'intervention-lineage-projection';
  readonly version: 1;
  readonly batchId: string;
  readonly generatedAt: string;
  readonly entries: readonly {
    readonly actionId: string;
    readonly kind: InterventionCommandActionKind;
    readonly status: InterventionStatus;
    readonly dependsOn: readonly string[];
    readonly downstream: {
      readonly scorecardDelta?: Readonly<Record<string, number>> | null | undefined;
      readonly runOutcomes?: readonly string[] | null | undefined;
    };
  }[];
}
