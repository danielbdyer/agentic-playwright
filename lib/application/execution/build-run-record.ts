import type { RunRecord } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import type { AdoId } from '../../domain/identity';
import type { PersistedEvidenceArtifact } from './persist-evidence';
import type { SelectedRunContext } from './select-run-context';

export interface BuildRunRecordResult {
  runRecord: RunRecord;
}

export function buildRunRecord(input: {
  adoId: AdoId;
  runId: string;
  selectedContext: SelectedRunContext;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): BuildRunRecordResult {
  const runRecord: RunRecord = {
    kind: 'scenario-run-record',
    version: 1,
    stage: 'execution',
    scope: 'run',
    ids: {
      adoId: input.adoId,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      runId: input.runId,
      dataset: input.selectedContext.activeDataset?.name ?? null,
      runbook: input.selectedContext.activeRunbook?.name ?? null,
      resolutionControl: input.selectedContext.activeRunbook?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: input.runId,
      content: input.selectedContext.scenarioEntry.artifact.source.content_hash,
      knowledge: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
      controls: input.selectedContext.taskPacketEntry.artifact.fingerprints.controls ?? null,
      task: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      run: input.runId,
    },
    lineage: {
      sources: [
        input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
        ...(input.selectedContext.activeRunbook ? [input.selectedContext.activeRunbook.artifactPath] : []),
        ...(input.selectedContext.activeDataset ? [input.selectedContext.activeDataset.artifactPath] : []),
      ],
      parents: [input.selectedContext.taskPacketEntry.artifact.taskFingerprint],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
    },
    governance: 'approved',
    payload: {
      runId: input.runId,
      adoId: input.adoId,
      revision: input.selectedContext.scenarioEntry.artifact.source.revision,
      title: input.selectedContext.scenarioEntry.artifact.metadata.title,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      taskFingerprint: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      knowledgeFingerprint: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
      provider: 'deterministic-runtime-step-agent',
      mode: input.selectedContext.mode,
      startedAt: input.stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
      completedAt: input.stepResults[input.stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
      steps: [],
      evidenceIds: [],
    },
    runId: input.runId,
    adoId: input.adoId,
    revision: input.selectedContext.scenarioEntry.artifact.source.revision,
    title: input.selectedContext.scenarioEntry.artifact.metadata.title,
    suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
    taskFingerprint: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
    knowledgeFingerprint: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
    provider: 'deterministic-runtime-step-agent',
    mode: input.selectedContext.mode,
    startedAt: input.stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
    completedAt: input.stepResults[input.stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
    steps: input.stepResults.map((step) => ({
      stepIndex: step.interpretation.stepIndex,
      interpretation: step.interpretation,
      execution: step.execution,
      evidenceIds: input.evidenceWrites
        .filter((entry) => entry.stepIndex === step.interpretation.stepIndex)
        .map((entry) => entry.artifactPath),
    })),
    evidenceIds: input.evidenceWrites.map((entry) => entry.artifactPath),
  };

  runRecord.governance = runRecord.steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed')
    ? 'blocked'
    : runRecord.steps.some((step) => step.interpretation.kind === 'resolved-with-proposals')
      ? 'review-required'
      : 'approved';
  runRecord.payload.steps = runRecord.steps;
  runRecord.payload.evidenceIds = runRecord.evidenceIds;

  return { runRecord };
}
