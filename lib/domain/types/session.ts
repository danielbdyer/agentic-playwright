import type { AdoId } from '../identity';
import type { InterventionKind, InterventionReceipt, Participant, ParticipantRef } from './intervention';
import type { WorkflowEnvelopeIds } from './workflow';

export type AgentEventType = Extract<
  InterventionKind,
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
>;

export interface TranscriptRef {
  readonly id: string;
  readonly kind: 'structured-log' | 'copilot-chat' | 'none';
  readonly label: string;
  readonly provider: string;
  readonly uri?: string | null | undefined;
  readonly artifactPath?: string | null | undefined;
}

export interface AgentEvent {
  readonly version: 1;
  readonly id: string;
  readonly at: string;
  readonly type: AgentEventType;
  readonly interventionId: string;
  readonly interventionKind: InterventionKind;
  readonly actor: 'agent' | 'human' | 'system';
  readonly summary: string;
  readonly ids?: WorkflowEnvelopeIds | undefined;
  readonly participantRefs: readonly ParticipantRef[];
  readonly refs: {
    readonly artifactPaths: readonly string[];
    readonly graphNodeIds: readonly string[];
    readonly selectorRefs: readonly string[];
    readonly transcriptIds: readonly string[];
  };
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AgentSession {
  readonly kind: 'agent-session';
  readonly version: 1;
  readonly sessionId: string;
  readonly adapterId: string;
  readonly providerId: string;
  readonly executionProfile: 'interactive' | 'ci-batch' | 'dogfood';
  readonly startedAt: string;
  readonly completedAt?: string | null | undefined;
  readonly scenarioIds: readonly AdoId[];
  readonly runIds: readonly string[];
  readonly participants: readonly Participant[];
  readonly participantCount: number;
  readonly interventions: readonly InterventionReceipt[];
  readonly interventionCount: number;
  readonly improvementRunIds: readonly string[];
  readonly transcripts: readonly TranscriptRef[];
  readonly eventCount: number;
  readonly eventTypes: Readonly<Record<AgentEventType, number>>;
}
