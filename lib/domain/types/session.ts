import type { AdoId } from '../identity';
import type { WorkflowEnvelopeIds } from './workflow';

export type AgentEventType =
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
  | 'replay-action';

export interface TranscriptRef {
  id: string;
  kind: 'structured-log' | 'copilot-chat' | 'none';
  label: string;
  provider: string;
  uri?: string | null | undefined;
  artifactPath?: string | null | undefined;
}

export interface AgentEvent {
  version: 1;
  id: string;
  at: string;
  type: AgentEventType;
  actor: 'agent' | 'human' | 'system';
  summary: string;
  ids?: WorkflowEnvelopeIds | undefined;
  refs: {
    artifactPaths: string[];
    graphNodeIds: string[];
    selectorRefs: string[];
    transcriptIds: string[];
  };
  payload: Record<string, unknown>;
}

export interface AgentSession {
  kind: 'agent-session';
  version: 1;
  sessionId: string;
  adapterId: string;
  providerId: string;
  executionProfile: 'interactive' | 'ci-batch' | 'dogfood';
  startedAt: string;
  completedAt?: string | null | undefined;
  scenarioIds: AdoId[];
  runIds: string[];
  transcripts: TranscriptRef[];
  eventCount: number;
  eventTypes: Record<AgentEventType, number>;
}
