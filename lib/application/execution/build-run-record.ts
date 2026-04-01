import type { RunRecord, ScenarioRunFold, ScenarioRunPlan } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import {
  createEnvelopeLineage,
  createRunRecordEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
  deriveGovernanceState,
} from '../catalog/envelope';
import type { PersistedEvidenceArtifact } from './persist-evidence';

export interface BuildRunRecordResult {
  runRecord: RunRecord;
}

export function buildRunRecord(input: {
  plan: ScenarioRunPlan;
  fold: ScenarioRunFold;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): BuildRunRecordResult {
  const steps = input.stepResults.map((step) => ({
    stepIndex: step.interpretation.stepIndex,
    interpretation: step.interpretation,
    execution: step.execution,
    evidenceIds: input.fold.byStep.get(step.interpretation.stepIndex)?.evidenceIds ?? [],
  }));
  const evidenceIds = input.fold.evidenceIds;

  const runRecord = createRunRecordEnvelope({
    ids: createScenarioEnvelopeIds({
      adoId: input.plan.adoId,
      suite: input.plan.suite,
      runId: input.plan.runId,
      dataset: input.plan.controlSelection.dataset,
      runbook: input.plan.controlSelection.runbook,
      resolutionControl: input.plan.controlSelection.resolutionControl,
    }),
    fingerprints: createScenarioEnvelopeFingerprints({
      artifact: input.plan.runId,
      content: input.plan.context.contentHash,
      knowledge: input.plan.resolutionContext.knowledgeFingerprint,
      controls: input.plan.controlsFingerprint,
      task: input.plan.surfaceFingerprint,
      run: input.plan.runId,
    }),
    lineage: createEnvelopeLineage({
      taskFingerprint: input.plan.surfaceFingerprint,
      runbookArtifactPath: input.plan.controlArtifactPaths.runbook ?? null,
      datasetArtifactPath: input.plan.controlArtifactPaths.dataset ?? null,
      parents: [input.plan.surfaceFingerprint],
      handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
    }),
    governance: deriveGovernanceState({
      hasBlocked: false,
      hasReviewRequired: steps.some((step) => step.interpretation.kind === 'needs-human' || step.execution.execution.status === 'failed'),
    }),
    payload: {
      runId: input.plan.runId,
      adoId: input.plan.adoId,
      revision: input.plan.context.revision,
      title: input.plan.title,
      suite: input.plan.suite,
      taskFingerprint: input.plan.surfaceFingerprint,
      knowledgeFingerprint: input.plan.resolutionContext.knowledgeFingerprint,
      provider: input.plan.providerId,
      mode: input.plan.mode,
      startedAt: input.stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
      completedAt: input.stepResults[input.stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
      steps: [],
      evidenceIds: [],
      translationMetrics: input.fold.translationMetrics,
      executionMetrics: input.fold.executionMetrics,
    },
    steps,
    evidenceIds,
  });

  return { runRecord };
}
