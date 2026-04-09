import type { RunRecord, ScenarioRunFold } from '../../domain/execution/types';
import type { ScenarioRunPlan } from '../../domain/resolution/types';
import type { RuntimeScenarioStepResult } from '../ports';
import {
  createRunRecordEnvelope,
  deriveGovernanceState,
  mintScenarioEnvelopeHeader,
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

  const header = mintScenarioEnvelopeHeader({
    adoId: input.plan.adoId,
    suite: input.plan.suite,
    runId: input.plan.runId,
    dataset: input.plan.controlSelection.dataset,
    runbook: input.plan.controlSelection.runbook,
    resolutionControl: input.plan.controlSelection.resolutionControl,
    contentHash: input.plan.context.contentHash,
    knowledgeFingerprint: input.plan.resolutionContext.knowledgeFingerprint,
    controlsFingerprint: input.plan.controlsFingerprint,
    surfaceFingerprint: input.plan.surfaceFingerprint,
    runbookArtifactPath: input.plan.controlArtifactPaths.runbook ?? null,
    datasetArtifactPath: input.plan.controlArtifactPaths.dataset ?? null,
    artifactFingerprint: input.plan.runId,
    parents: [input.plan.surfaceFingerprint],
    handshakes: ['preparation', 'resolution', 'execution', 'evidence'],
  });

  const runRecord = createRunRecordEnvelope({
    ids: header.ids,
    fingerprints: header.fingerprints,
    lineage: header.lineage,
    governance: deriveGovernanceState({
      hasBlocked: steps.some((step) => step.execution.execution.status === 'failed'),
      hasReviewRequired: steps.some((step) => step.interpretation.kind === 'needs-human'),
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
