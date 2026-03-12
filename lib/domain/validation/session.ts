import { createAdoId } from '../identity';
import type { AgentEvent, AgentSession, TranscriptRef } from '../types';
import {
  expectArray,
  expectEnum,
  expectId,
  expectNumber,
  expectOptionalString,
  expectRecord,
  expectString,
  expectStringArray,
} from './primitives';

function validateTranscriptRef(value: unknown, path: string): TranscriptRef {
  const transcript = expectRecord(value, path);
  return {
    id: expectString(transcript.id, `${path}.id`),
    kind: expectEnum(transcript.kind, `${path}.kind`, ['structured-log', 'copilot-chat', 'none'] as const),
    label: expectString(transcript.label, `${path}.label`),
    provider: expectString(transcript.provider, `${path}.provider`),
    uri: expectOptionalString(transcript.uri, `${path}.uri`) ?? null,
    artifactPath: expectOptionalString(transcript.artifactPath, `${path}.artifactPath`) ?? null,
  };
}

export function validateAgentEvent(value: unknown): AgentEvent {
  const event = expectRecord(value, 'agentEvent');
  const ids = event.ids === undefined ? undefined : expectRecord(event.ids, 'agentEvent.ids');
  const refs = expectRecord(event.refs ?? {}, 'agentEvent.refs');
  const payload = expectRecord(event.payload ?? {}, 'agentEvent.payload');
  return {
    version: expectEnum(String(event.version ?? '1'), 'agentEvent.version', ['1'] as const) as unknown as 1,
    id: expectString(event.id, 'agentEvent.id'),
    at: expectString(event.at, 'agentEvent.at'),
    type: expectEnum(event.type, 'agentEvent.type', ['orientation', 'artifact-inspection', 'discovery-request', 'observation-recorded', 'spec-fragment-proposed', 'proposal-approved', 'proposal-rejected', 'rerun-requested', 'execution-reviewed', 'benchmark-action', 'replay-action'] as const),
    actor: expectEnum(event.actor, 'agentEvent.actor', ['agent', 'human', 'system'] as const),
    summary: expectString(event.summary, 'agentEvent.summary'),
    ids: ids === undefined ? undefined : {
      adoId: ids.adoId === undefined ? null : (expectId(ids.adoId, 'agentEvent.ids.adoId', createAdoId) ?? null),
      suite: expectOptionalString(ids.suite, 'agentEvent.ids.suite') ?? null,
      runId: expectOptionalString(ids.runId, 'agentEvent.ids.runId') ?? null,
      stepIndex: ids.stepIndex === undefined || ids.stepIndex === null ? null : expectNumber(ids.stepIndex, 'agentEvent.ids.stepIndex'),
      dataset: expectOptionalString(ids.dataset, 'agentEvent.ids.dataset') ?? null,
      runbook: expectOptionalString(ids.runbook, 'agentEvent.ids.runbook') ?? null,
      resolutionControl: expectOptionalString(ids.resolutionControl, 'agentEvent.ids.resolutionControl') ?? null,
    },
    refs: {
      artifactPaths: expectStringArray(refs.artifactPaths ?? [], 'agentEvent.refs.artifactPaths'),
      graphNodeIds: expectStringArray(refs.graphNodeIds ?? [], 'agentEvent.refs.graphNodeIds'),
      selectorRefs: expectStringArray(refs.selectorRefs ?? [], 'agentEvent.refs.selectorRefs'),
      transcriptIds: expectStringArray(refs.transcriptIds ?? [], 'agentEvent.refs.transcriptIds'),
    },
    payload,
  };
}

export function validateAgentSession(value: unknown): AgentSession {
  const session = expectRecord(value, 'agentSession');
  const eventTypes = expectRecord(session.eventTypes ?? {}, 'agentSession.eventTypes');
  return {
    kind: expectEnum(session.kind, 'agentSession.kind', ['agent-session'] as const),
    version: expectEnum(String(session.version ?? '1'), 'agentSession.version', ['1'] as const) as unknown as 1,
    sessionId: expectString(session.sessionId, 'agentSession.sessionId'),
    adapterId: expectString(session.adapterId, 'agentSession.adapterId'),
    providerId: expectString(session.providerId, 'agentSession.providerId'),
    executionProfile: expectEnum(session.executionProfile, 'agentSession.executionProfile', ['interactive', 'ci-batch', 'dogfood'] as const),
    startedAt: expectString(session.startedAt, 'agentSession.startedAt'),
    completedAt: expectOptionalString(session.completedAt, 'agentSession.completedAt') ?? null,
    scenarioIds: expectArray(session.scenarioIds ?? [], 'agentSession.scenarioIds').map((entry, index) =>
      expectId(entry, `agentSession.scenarioIds[${index}]`, createAdoId),
    ),
    runIds: expectStringArray(session.runIds ?? [], 'agentSession.runIds'),
    transcripts: expectArray(session.transcripts ?? [], 'agentSession.transcripts').map((entry, index) =>
      validateTranscriptRef(entry, `agentSession.transcripts[${index}]`),
    ),
    eventCount: expectNumber(session.eventCount ?? 0, 'agentSession.eventCount'),
    eventTypes: Object.fromEntries(
      Object.entries(eventTypes).map(([key, value]) => [key, expectNumber(value ?? 0, `agentSession.eventTypes.${key}`)]),
    ) as AgentSession['eventTypes'],
  };
}
