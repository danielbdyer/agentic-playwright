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
  const executionMetrics = {
    timingTotals: steps.reduce((acc, step) => ({
      setupMs: acc.setupMs + (step.execution.timing?.setupMs ?? 0),
      resolutionMs: acc.resolutionMs + (step.execution.timing?.resolutionMs ?? 0),
      actionMs: acc.actionMs + (step.execution.timing?.actionMs ?? 0),
      assertionMs: acc.assertionMs + (step.execution.timing?.assertionMs ?? 0),
      retriesMs: acc.retriesMs + (step.execution.timing?.retriesMs ?? 0),
      teardownMs: acc.teardownMs + (step.execution.timing?.teardownMs ?? 0),
      totalMs: acc.totalMs + (step.execution.timing?.totalMs ?? step.execution.durationMs ?? 0),
    }), {
      setupMs: 0,
      resolutionMs: 0,
      actionMs: 0,
      assertionMs: 0,
      retriesMs: 0,
      teardownMs: 0,
      totalMs: 0,
    }),
    costTotals: steps.reduce((acc, step) => ({
      instructionCount: acc.instructionCount + (step.execution.cost?.instructionCount ?? 0),
      diagnosticCount: acc.diagnosticCount + (step.execution.cost?.diagnosticCount ?? 0),
    }), { instructionCount: 0, diagnosticCount: 0 }),
    budgetBreaches: steps.filter((step) => step.execution.budget?.status === 'over-budget').length,
    failureFamilies: steps.reduce<Record<'none' | 'precondition-failure' | 'locator-degradation-failure' | 'environment-runtime-failure', number>>((acc, step) => {
      const family = step.execution.failure?.family ?? 'none';
      acc[family] += 1;
      return acc;
    }, {
      none: 0,
      'precondition-failure': 0,
      'locator-degradation-failure': 0,
      'environment-runtime-failure': 0,
    }),
    recoveryFamilies: steps.reduce<Record<'precondition-failure' | 'locator-degradation-failure' | 'environment-runtime-failure', number>>((acc, step) => {
      for (const attempt of step.execution.recovery?.attempts ?? []) {
        acc[attempt.family] += 1;
      }
      return acc;
    }, {
      'precondition-failure': 0,
      'locator-degradation-failure': 0,
      'environment-runtime-failure': 0,
    }),
    recoveryStrategies: steps.reduce<Record<'verify-prerequisites' | 'execute-prerequisite-actions' | 'force-alternate-locator-rungs' | 'snapshot-guided-reresolution' | 'bounded-retry-with-backoff' | 'refresh-runtime', number>>((acc, step) => {
      for (const attempt of step.execution.recovery?.attempts ?? []) {
        acc[attempt.strategyId] += 1;
      }
      return acc;
    }, {
      'verify-prerequisites': 0,
      'execute-prerequisite-actions': 0,
      'force-alternate-locator-rungs': 0,
      'snapshot-guided-reresolution': 0,
      'bounded-retry-with-backoff': 0,
      'refresh-runtime': 0,
    }),
  };

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
      knowledge: input.selectedContext.taskPacketEntry.artifact.payload.knowledgeFingerprint,
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
      hasReviewRequired: false,
    }),
    payload: {
      runId: input.runId,
      adoId: input.adoId,
      revision: input.selectedContext.scenarioEntry.artifact.source.revision,
      title: input.selectedContext.scenarioEntry.artifact.metadata.title,
      suite: input.selectedContext.scenarioEntry.artifact.metadata.suite,
      taskFingerprint: input.selectedContext.taskPacketEntry.artifact.taskFingerprint,
      knowledgeFingerprint: input.selectedContext.taskPacketEntry.artifact.payload.knowledgeFingerprint,
      provider: input.selectedContext.providerId,
      mode: input.selectedContext.mode,
      startedAt: input.stepResults[0]?.interpretation.runAt ?? new Date().toISOString(),
      completedAt: input.stepResults[input.stepResults.length - 1]?.execution.runAt ?? new Date().toISOString(),
      steps: [],
      evidenceIds: [],
      translationMetrics: metrics,
      executionMetrics,
    },
    steps,
    evidenceIds,
  });

  return { runRecord };
}
