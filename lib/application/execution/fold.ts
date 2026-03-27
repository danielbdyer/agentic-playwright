import type { ScenarioRunFold, ScenarioRunPlan, StepExecutionReceipt, TranslationRunMetrics } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';
import { uniqueSorted } from '../../domain/collections';

function computeTranslationMetrics(stepResults: RuntimeScenarioStepResult[]): TranslationRunMetrics {
  let total = 0;
  let hits = 0;
  let misses = 0;
  let disabled = 0;
  const missReasons: Record<string, number> = {};
  const failureClasses: Record<string, number> = {};

  for (const step of stepResults) {
    const entry = step.interpretation.translation;
    if (!entry) continue;
    total++;
    const status = entry.cache?.status;
    if (status === 'hit') hits++;
    else if (status === 'miss') misses++;
    else if (status === 'disabled') disabled++;
    if (status !== 'hit') {
      const reason = entry.cache?.reason ?? 'none';
      missReasons[reason] = (missReasons[reason] ?? 0) + 1;
    }
    const key = entry.failureClass ?? 'none';
    failureClasses[key] = (failureClasses[key] ?? 0) + 1;
  }

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

function emptyTiming(): StepExecutionReceipt['timing'] {
  return {
    setupMs: 0,
    resolutionMs: 0,
    actionMs: 0,
    assertionMs: 0,
    retriesMs: 0,
    teardownMs: 0,
    totalMs: 0,
  };
}

function emptyCost(): StepExecutionReceipt['cost'] {
  return {
    instructionCount: 0,
    diagnosticCount: 0,
  };
}

export function foldScenarioRun(input: {
  plan: ScenarioRunPlan;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): ScenarioRunFold {
  type StepEntry = ScenarioRunFold['byStep'] extends ReadonlyMap<number, infer T> ? T : never;
  // Pre-index evidence by stepIndex: O(E) build via reduce, then O(1) per step
  const evidenceByStep = input.evidenceWrites.reduce<ReadonlyMap<number, readonly string[]>>(
    (acc, entry) => new Map([...acc, [entry.stepIndex, [...(acc.get(entry.stepIndex) ?? []), entry.artifactPath]]]),
    new Map(),
  );
  const byStep = new Map<number, StepEntry>(
    input.stepResults.map((result) => {
      const stepIndex = result.interpretation.stepIndex;
      const stepEvidence = evidenceByStep.get(stepIndex) ?? [];
      const entry: StepEntry = {
        stepIndex,
        evidenceIds: stepEvidence,
        observedStateRefs: result.execution.observedStateRefs ?? [],
        matchedTransitionRefs: (result.execution.transitionObservations ?? [])
          .filter((entry) => entry.classification === 'matched' && entry.transitionRef)
          .map((entry) => entry.transitionRef!),
        failureFamily: result.execution.failure?.family ?? 'none',
        failureCode: result.execution.failure?.code ?? null,
        failureMessage: result.execution.failure?.message ?? null,
        translation: result.interpretation.translation ?? null,
        recoveryAttempts: (result.execution.recovery?.attempts ?? []).map((entry) => entry.strategyId),
        timing: result.execution.timing,
        cost: result.execution.cost,
        budgetStatus: result.execution.budget?.status ?? 'not-configured',
        degraded: result.execution.degraded,
        resolutionMode: result.interpretation.resolutionMode,
        winningSource: result.interpretation.winningSource,
      };
      return [stepIndex, entry];
    }),
  );

  const timingTotals = [...byStep.values()].reduce((acc, step) => ({
    setupMs: acc.setupMs + (step.timing?.setupMs ?? 0),
    resolutionMs: acc.resolutionMs + (step.timing?.resolutionMs ?? 0),
    actionMs: acc.actionMs + (step.timing?.actionMs ?? 0),
    assertionMs: acc.assertionMs + (step.timing?.assertionMs ?? 0),
    retriesMs: acc.retriesMs + (step.timing?.retriesMs ?? 0),
    teardownMs: acc.teardownMs + (step.timing?.teardownMs ?? 0),
    totalMs: acc.totalMs + (step.timing?.totalMs ?? 0),
  }), emptyTiming());

  const costTotals = [...byStep.values()].reduce((acc, step) => ({
    instructionCount: acc.instructionCount + (step.cost?.instructionCount ?? 0),
    diagnosticCount: acc.diagnosticCount + (step.cost?.diagnosticCount ?? 0),
  }), emptyCost());

  const executionMetrics = {
    timingTotals,
    costTotals,
    budgetBreaches: [...byStep.values()].filter((step) => step.budgetStatus === 'over-budget').length,
    failureFamilies: [...byStep.values()].reduce<Record<StepExecutionReceipt['failure']['family'], number>>(
      (acc, step) => ({ ...acc, [step.failureFamily]: acc[step.failureFamily] + 1 }),
      { none: 0, 'precondition-failure': 0, 'locator-degradation-failure': 0, 'environment-runtime-failure': 0 },
    ),
    recoveryFamilies: input.stepResults.flatMap((step) => step.execution.recovery?.attempts ?? []).reduce<Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>>(
      (acc, attempt) => ({ ...acc, [attempt.family]: (acc[attempt.family] ?? 0) + 1 }),
      { 'precondition-failure': 0, 'locator-degradation-failure': 0, 'environment-runtime-failure': 0 },
    ),
    recoveryStrategies: input.stepResults.flatMap((step) => step.execution.recovery?.attempts ?? []).reduce<Record<StepExecutionReceipt['recovery']['attempts'][number]['strategyId'], number>>(
      (acc, attempt) => ({ ...acc, [attempt.strategyId]: (acc[attempt.strategyId] ?? 0) + 1 }),
      { 'verify-prerequisites': 0, 'execute-prerequisite-actions': 0, 'force-alternate-locator-rungs': 0, 'snapshot-guided-reresolution': 0, 'bounded-retry-with-backoff': 0, 'refresh-runtime': 0 },
    ),
  };

  return {
    kind: 'scenario-run-fold',
    version: 1,
    adoId: input.plan.adoId,
    runId: input.plan.runId,
    surfaceFingerprint: input.plan.surfaceFingerprint,
    byStep,
    translationMetrics: computeTranslationMetrics(input.stepResults),
    executionMetrics,
    evidenceIds: input.evidenceWrites.map((entry) => entry.artifactPath),
    observedStateRefs: uniqueSorted([...byStep.values()].flatMap((step) => step.observedStateRefs)),
    matchedTransitionRefs: uniqueSorted([...byStep.values()].flatMap((step) => step.matchedTransitionRefs)),
  };
}
