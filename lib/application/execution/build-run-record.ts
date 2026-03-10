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


function translationMetrics(stepResults: RuntimeScenarioStepResult[]) {
  const relevant = stepResults
    .map((step) => step.interpretation.translation)
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const total = relevant.length;
  const hits = relevant.filter((entry) => entry.cache?.status === 'hit').length;
  const misses = relevant.filter((entry) => entry.cache?.status === 'miss').length;
  const disabled = relevant.filter((entry) => entry.cache?.status === 'disabled').length;
  const missReasons = relevant
    .filter((entry) => entry.cache?.status !== 'hit')
    .reduce<Record<string, number>>((acc, entry) => {
      const reason = entry.cache?.reason ?? 'none';
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});
  const failureClasses = relevant.reduce<Record<string, number>>((acc, entry) => {
    const key = entry.failureClass ?? 'none';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total,
    hits,
    misses,
    disabled,
    hitRate: Number((total === 0 ? 0 : hits / total).toFixed(2)),
    missReasons,
    failureClasses,
  };
}

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

  const metrics = translationMetrics(input.stepResults);

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
      translationMetrics: metrics,
    },
    steps,
    evidenceIds,
  });

  return { runRecord };
}
