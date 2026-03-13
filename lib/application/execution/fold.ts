import type { ScenarioRunFold, ScenarioRunPlan, StepExecutionReceipt, TranslationRunMetrics } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right)) as T[];
}

function computeTranslationMetrics(stepResults: RuntimeScenarioStepResult[]): TranslationRunMetrics {
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
  const byStep = new Map<number, ScenarioRunFold['byStep'] extends ReadonlyMap<number, infer T> ? T : never>();

  for (const result of input.stepResults) {
    const stepIndex = result.interpretation.stepIndex;
    const stepEvidence = input.evidenceWrites
      .filter((entry) => entry.stepIndex === stepIndex)
      .map((entry) => entry.artifactPath);

    byStep.set(stepIndex, {
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
    });
  }

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
    failureFamilies: [...byStep.values()].reduce<Record<StepExecutionReceipt['failure']['family'], number>>((acc, step) => {
      acc[step.failureFamily] += 1;
      return acc;
    }, {
      none: 0,
      'precondition-failure': 0,
      'locator-degradation-failure': 0,
      'environment-runtime-failure': 0,
    }),
    recoveryFamilies: input.stepResults.reduce<Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>>((acc, step) => {
      for (const attempt of step.execution.recovery?.attempts ?? []) {
        acc[attempt.family] += 1;
      }
      return acc;
    }, {
      'precondition-failure': 0,
      'locator-degradation-failure': 0,
      'environment-runtime-failure': 0,
    }),
    recoveryStrategies: input.stepResults.reduce<Record<StepExecutionReceipt['recovery']['attempts'][number]['strategyId'], number>>((acc, step) => {
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
