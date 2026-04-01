import type { ScenarioRunFold, ScenarioRunPlan, StepExecutionReceipt, TranslationRunMetrics } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import type { PersistedEvidenceArtifact } from './persist-evidence';
import { uniqueSorted } from '../../domain/kernel/collections';

// ─── Monoid Combinators ───
// Each has an `empty` (identity) and `combine` (associative binary op).
// Use with .reduce(combine, empty) for type-safe accumulation.

type Timing = StepExecutionReceipt['timing'];
type Cost = StepExecutionReceipt['cost'];

const emptyTiming: Timing = { setupMs: 0, resolutionMs: 0, actionMs: 0, assertionMs: 0, retriesMs: 0, teardownMs: 0, totalMs: 0 };

const combineTiming = (a: Timing, b: Timing | null | undefined): Timing => ({
  setupMs: a.setupMs + (b?.setupMs ?? 0),
  resolutionMs: a.resolutionMs + (b?.resolutionMs ?? 0),
  actionMs: a.actionMs + (b?.actionMs ?? 0),
  assertionMs: a.assertionMs + (b?.assertionMs ?? 0),
  retriesMs: a.retriesMs + (b?.retriesMs ?? 0),
  teardownMs: a.teardownMs + (b?.teardownMs ?? 0),
  totalMs: a.totalMs + (b?.totalMs ?? 0),
});

const emptyCost: Cost = { instructionCount: 0, diagnosticCount: 0 };

const combineCost = (a: Cost, b: Cost | null | undefined): Cost => ({
  instructionCount: a.instructionCount + (b?.instructionCount ?? 0),
  diagnosticCount: a.diagnosticCount + (b?.diagnosticCount ?? 0),
});

// ─── Translation Metrics (pure fold) ───

interface TranslationAcc {
  readonly total: number;
  readonly hits: number;
  readonly misses: number;
  readonly disabled: number;
  readonly missReasons: Readonly<Record<string, number>>;
  readonly failureClasses: Readonly<Record<string, number>>;
}

const emptyTranslationAcc: TranslationAcc = { total: 0, hits: 0, misses: 0, disabled: 0, missReasons: {}, failureClasses: {} };

const foldTranslationStep = (acc: TranslationAcc, entry: NonNullable<RuntimeScenarioStepResult['interpretation']['translation']>): TranslationAcc => {
  const status = entry.cache?.status;
  const reason = entry.cache?.reason ?? 'none';
  const failKey = entry.failureClass ?? 'none';
  return {
    total: acc.total + 1,
    hits: acc.hits + (status === 'hit' ? 1 : 0),
    misses: acc.misses + (status === 'miss' ? 1 : 0),
    disabled: acc.disabled + (status === 'disabled' ? 1 : 0),
    missReasons: status !== 'hit' ? { ...acc.missReasons, [reason]: (acc.missReasons[reason] ?? 0) + 1 } : acc.missReasons,
    failureClasses: { ...acc.failureClasses, [failKey]: (acc.failureClasses[failKey] ?? 0) + 1 },
  };
};

function computeTranslationMetrics(stepResults: RuntimeScenarioStepResult[]): TranslationRunMetrics {
  const acc = stepResults.reduce<TranslationAcc>(
    (a, step) => step.interpretation.translation ? foldTranslationStep(a, step.interpretation.translation) : a,
    emptyTranslationAcc,
  );
  return {
    ...acc,
    hitRate: Number((acc.total === 0 ? 0 : acc.hits / acc.total).toFixed(2)),
  };
}

export function foldScenarioRun(input: {
  plan: ScenarioRunPlan;
  stepResults: RuntimeScenarioStepResult[];
  evidenceWrites: PersistedEvidenceArtifact[];
}): ScenarioRunFold {
  type StepEntry = ScenarioRunFold['byStep'] extends ReadonlyMap<number, infer T> ? T : never;
  // Pre-index evidence by stepIndex: O(E) build, then O(1) per step
  const evidenceByStep: ReadonlyMap<number, readonly string[]> = input.evidenceWrites.reduce(
    (acc, entry) => acc.set(entry.stepIndex, [...(acc.get(entry.stepIndex) ?? []), entry.artifactPath]),
    new Map<number, string[]>(),
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
          .flatMap((entry) => entry.classification === 'matched' && entry.transitionRef ? [entry.transitionRef] : []),
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

  const steps = [...byStep.values()];
  const timingTotals = steps.reduce((acc, step) => combineTiming(acc, step.timing), emptyTiming);
  const costTotals = steps.reduce((acc, step) => combineCost(acc, step.cost), emptyCost);

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
