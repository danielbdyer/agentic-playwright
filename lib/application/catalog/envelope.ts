import { sha256, stableStringify } from '../../domain/hash';
import type { AdoId } from '../../domain/identity';
import type { ProposalBundle, RunRecord, ScenarioRunStep } from '../../domain/types';
import type { Governance, WorkflowEnvelopeFingerprints, WorkflowEnvelopeIds, WorkflowEnvelopeLineage } from '../../domain/types/workflow';
import type { ProjectPaths } from '../paths';
import { relativeProjectPath } from '../paths';
import type { ArtifactEnvelope } from './types';

export function fingerprintArtifact(artifact: unknown): string {
  return `sha256:${sha256(stableStringify(artifact))}`;
}

export function createArtifactEnvelope<T>(paths: ProjectPaths, absolutePath: string, artifact: T): ArtifactEnvelope<T> {
  return {
    artifact,
    absolutePath,
    artifactPath: relativeProjectPath(paths, absolutePath),
    fingerprint: fingerprintArtifact(artifact),
  };
}

export function upsertArtifactEnvelope<T>(
  entries: ArtifactEnvelope<T>[],
  entry: ArtifactEnvelope<T>,
  matches: (candidate: ArtifactEnvelope<T>) => boolean,
): ArtifactEnvelope<T>[] {
  return [...entries.filter((candidate) => !matches(candidate)), entry]
    .sort((left, right) => left.artifactPath.localeCompare(right.artifactPath));
}

export function createScenarioEnvelopeIds(input: {
  adoId: AdoId;
  suite: string;
  runId: string;
  dataset?: string | null | undefined;
  runbook?: string | null | undefined;
  resolutionControl?: string | null | undefined;
}): WorkflowEnvelopeIds {
  return {
    adoId: input.adoId,
    suite: input.suite,
    runId: input.runId,
    dataset: input.dataset ?? null,
    runbook: input.runbook ?? null,
    resolutionControl: input.resolutionControl ?? null,
  };
}

export function createScenarioEnvelopeFingerprints(input: {
  artifact: string;
  content: string;
  knowledge?: string | null | undefined;
  controls?: string | null | undefined;
  task?: string | null | undefined;
  run?: string | null | undefined;
}): WorkflowEnvelopeFingerprints {
  return {
    artifact: input.artifact,
    content: input.content,
    knowledge: input.knowledge ?? null,
    controls: input.controls ?? null,
    task: input.task ?? null,
    run: input.run ?? null,
  };
}

export function createEnvelopeLineage(input: {
  taskFingerprint: string;
  runbookArtifactPath?: string | null | undefined;
  datasetArtifactPath?: string | null | undefined;
  parents: string[];
  handshakes: WorkflowEnvelopeLineage['handshakes'];
}): WorkflowEnvelopeLineage {
  return {
    sources: [
      input.taskFingerprint,
      ...(input.runbookArtifactPath ? [input.runbookArtifactPath] : []),
      ...(input.datasetArtifactPath ? [input.datasetArtifactPath] : []),
    ],
    parents: input.parents,
    handshakes: input.handshakes,
  };
}

export function deriveGovernanceState(input: {
  hasBlocked: boolean;
  hasReviewRequired: boolean;
}): Governance {
  return input.hasBlocked
    ? 'blocked'
    : input.hasReviewRequired
      ? 'review-required'
      : 'approved';
}

export function createRunRecordEnvelope(input: {
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  payload: RunRecord['payload'];
  steps: ScenarioRunStep[];
  evidenceIds: string[];
  governance: Governance;
}): RunRecord {
  return {
    kind: 'scenario-run-record',
    version: 1,
    stage: 'execution',
    scope: 'run',
    ids: input.ids,
    fingerprints: input.fingerprints,
    lineage: input.lineage,
    governance: input.governance,
    payload: {
      ...input.payload,
      steps: input.steps,
      evidenceIds: input.evidenceIds,
      translationMetrics: input.payload.translationMetrics,
      executionMetrics: input.payload.executionMetrics,
    },
    runId: input.payload.runId,
    adoId: input.payload.adoId,
    revision: input.payload.revision,
    title: input.payload.title,
    suite: input.payload.suite,
    taskFingerprint: input.payload.taskFingerprint,
    knowledgeFingerprint: input.payload.knowledgeFingerprint,
    provider: input.payload.provider,
    mode: input.payload.mode,
    startedAt: input.payload.startedAt,
    completedAt: input.payload.completedAt,
    steps: input.steps,
    evidenceIds: input.evidenceIds,
    translationMetrics: input.payload.translationMetrics,
    executionMetrics: input.payload.executionMetrics,
  };
}

export function createProposalBundleEnvelope(input: {
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  payload: ProposalBundle['payload'];
  proposals: ProposalBundle['proposals'];
  governance: Governance;
}): ProposalBundle {
  return {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: input.ids,
    fingerprints: input.fingerprints,
    lineage: input.lineage,
    governance: input.governance,
    payload: {
      ...input.payload,
      proposals: input.proposals,
    },
    adoId: input.payload.adoId,
    runId: input.payload.runId,
    revision: input.payload.revision,
    title: input.payload.title,
    suite: input.payload.suite,
    proposals: input.proposals,
  };
}
