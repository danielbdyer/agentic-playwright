import type { RunRecord } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import type { AdoId } from '../../domain/identity';
import {
  createEnvelopeLineage,
  createRunRecordEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
  deriveGovernanceState,
} from '../catalog/envelope';
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
  const steps = input.stepResults.map((step) => ({
    stepIndex: step.interpretation.stepIndex,
    interpretation: step.interpretation,
    execution: step.execution,
    evidenceIds: input.evidenceWrites
      .filter((entry) => entry.stepIndex === step.interpretation.stepIndex)
      .map((entry) => entry.artifactPath),
  }));
  const evidenceIds = input.evidenceWrites.map((entry) => entry.artifactPath);

  const runRecord = createRunRecordEnvelope({
    ids: createScenarioEnvelopeIds({
      adoId: input.adoId,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      runId: input.runId,
      dataset: input.selectedContext.activeDataset?.name,
      runbook: input.selectedContext.activeRunbook?.name,
      resolutionControl: input.selectedContext.activeRunbook?.resolutionControl,
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: input.runId,
      content: input.selectedContext.scenarioEntry.artifact.source.content_hash,
      knowledge: input.selectedContext.taskPacketEntry.artifact.knowledgeFingerprint,
      controls: input.selectedContext.taskPacketEntry.artifact.fingerprints.controls,
      task: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      run: input.runId,
    }),
    lineage: createEnvelopeLineage({
      taskFingerprint: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      runbookArtifactPath: input.selectedContext.activeRunbook?.artifactPath,
      datasetArtifactPath: input.selectedContext.activeDataset?.artifactPath,
      parents: [input.selectedContext.taskPacketEntry.artifact.taskFingerprint],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
    }),
    governance: deriveGovernanceState({
      hasBlocked: steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed'),
      hasReviewRequired: steps.some((step) => step.interpretation.kind === 'resolved-with-proposals'),
    }),
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
    steps,
    evidenceIds,
  });

  return { runRecord };
}
