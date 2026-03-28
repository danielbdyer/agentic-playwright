import { provenanceKindForBoundStep } from '../provenance';
import { aggregateConfidence } from '../status';
import type { BoundScenario, Governance, RunRecord, ScenarioExplanation, ScenarioLifecycle, StepProvenanceKind } from '../types';
import { isReviewRequired } from '../types/workflow';

export function aggregateScenarioGovernance(boundScenario: BoundScenario, latestRun?: RunRecord | null): Governance {
  if (latestRun?.steps.some((step) => step.interpretation.kind === 'needs-human')) {
    return 'blocked';
  }

  const states = [...new Set(boundScenario.steps.map((step) => step.binding.governance))];
  if (states.includes('blocked')) {
    return 'blocked';
  }
  if (states.includes('review-required')) {
    return 'review-required';
  }
  return 'approved';
}

function runtimeStatusForStep(run: RunRecord | null | undefined, stepIndex: number): ScenarioExplanation['steps'][number]['runtime'] {
  const runStep = run?.steps.find((step) => step.stepIndex === stepIndex);
  if (!runStep) {
    return {
      status: 'pending',
      runId: null,
      resolutionMode: null,
      widgetContract: null,
      locatorStrategy: null,
      locatorRung: null,
      degraded: false,
      preconditionFailures: [],
      planning: {
        status: 'not-applicable',
        requiredPreconditions: [],
        forbiddenPreconditions: [],
        chosenTransitionPath: [],
        chosenEventSignaturePath: [],
      },
      requiredStateRefs: [],
      forbiddenStateRefs: [],
      effectAssertions: [],
      eventSignatureRefs: [],
      expectedTransitionRefs: [],
      observedStateRefs: [],
      transitionObservations: [],
      durationMs: 0,
      timing: {
        setupMs: 0,
        resolutionMs: 0,
        actionMs: 0,
        assertionMs: 0,
        retriesMs: 0,
        teardownMs: 0,
        totalMs: 0,
      },
      budget: {
        status: 'not-configured',
        breaches: [],
      },
      failure: {
        family: 'none',
        code: null,
      },
      exhaustion: [],
    };
  }

  return {
    status: runStep.interpretation.kind,
    runId: run?.runId ?? null,
    resolutionMode: runStep.interpretation.resolutionMode,
    widgetContract: runStep.execution.widgetContract ?? null,
    locatorStrategy: runStep.execution.locatorStrategy ?? null,
    locatorRung: runStep.execution.locatorRung ?? null,
    degraded: runStep.execution.degraded,
    preconditionFailures: runStep.execution.preconditionFailures,
    planning: runStep.execution.planning
      ? {
        status: runStep.execution.planning.status,
        requiredPreconditions: runStep.execution.planning.requiredPreconditions,
        forbiddenPreconditions: runStep.execution.planning.forbiddenPreconditions,
        chosenTransitionPath: runStep.execution.planning.chosenTransitionPath.map((entry) => entry.transitionRef),
        chosenEventSignaturePath: runStep.execution.planning.chosenTransitionPath.map((entry) => entry.eventSignatureRef),
      }
      : {
        status: 'not-applicable',
        requiredPreconditions: [],
        forbiddenPreconditions: [],
        chosenTransitionPath: [],
        chosenEventSignaturePath: [],
      },
    requiredStateRefs: runStep.execution.requiredStateRefs ?? [],
    forbiddenStateRefs: runStep.execution.forbiddenStateRefs ?? [],
    effectAssertions: runStep.execution.effectAssertions ?? [],
    eventSignatureRefs: runStep.execution.eventSignatureRefs ?? [],
    expectedTransitionRefs: runStep.execution.expectedTransitionRefs ?? [],
    observedStateRefs: runStep.execution.observedStateRefs ?? [],
    transitionObservations: (runStep.execution.transitionObservations ?? []).map((entry) => ({
      transitionRef: entry.transitionRef ?? null,
      classification: entry.classification,
    })),
    durationMs: runStep.execution.durationMs,
    timing: runStep.execution.timing,
    budget: {
      status: runStep.execution.budget.status,
      breaches: runStep.execution.budget.breaches,
    },
    failure: {
      family: runStep.execution.failure.family,
      code: runStep.execution.failure.code ?? null,
    },
    navigation: runStep.execution.navigation
      ? {
        selectedRouteVariantRef: runStep.execution.navigation.selectedRouteVariantRef,
        selectedRouteUrl: runStep.execution.navigation.selectedRouteUrl,
        semanticDestination: runStep.execution.navigation.semanticDestination,
        expectedEntryStateRefs: runStep.execution.navigation.expectedEntryStateRefs,
        observedEntryStateRefs: runStep.execution.navigation.observedEntryStateRefs,
        fallbackRoutePath: runStep.execution.navigation.fallbackRoutePath,
        mismatch: runStep.execution.navigation.mismatch,
        rationale: runStep.execution.navigation.rationale ?? null,
      }
      : undefined,
    exhaustion: runStep.interpretation.exhaustion,
  };
}

function governanceForStep(boundStep: BoundScenario['steps'][number], run: RunRecord | null | undefined): Governance {
  const runStep = run?.steps.find((step) => step.stepIndex === boundStep.index);
  if (!runStep) {
    return boundStep.binding.governance;
  }
  if (runStep.interpretation.kind === 'needs-human') {
    return 'blocked';
  }
  return 'approved';
}

function provenanceForStep(boundStep: BoundScenario['steps'][number], run: RunRecord | null | undefined): StepProvenanceKind {
  const runStep = run?.steps.find((step) => step.stepIndex === boundStep.index);
  if (runStep) {
    return runStep.interpretation.provenanceKind;
  }
  return provenanceKindForBoundStep(boundStep);
}

export function explainBoundScenario(boundScenario: BoundScenario, lifecycle: ScenarioLifecycle, latestRun?: RunRecord | null): ScenarioExplanation {
  const steps = boundScenario.steps.map((step) => ({
    index: step.index,
    intent: step.intent,
    actionText: step.action_text,
    expectedText: step.expected_text,
    normalizedIntent: step.binding.normalizedIntent,
    action: step.action,
    confidence: step.confidence,
    provenanceKind: provenanceForStep(step, latestRun),
    governance: governanceForStep(step, latestRun),
    bindingKind: step.binding.kind,
    ruleId: step.binding.ruleId,
    knowledgeRefs: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.knowledgeRefs ?? step.binding.knowledgeRefs,
    supplementRefs: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.supplementRefs ?? step.binding.supplementRefs,
    controlRefs: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.controlRefs ?? [],
    evidenceRefs: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.evidenceRefs ?? [],
    overlayRefs: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.overlayRefs ?? [],
    reviewReasons: step.binding.reviewReasons,
    unresolvedGaps: (() => {
      const runStep = latestRun?.steps.find((candidate) => candidate.stepIndex === step.index);
      if (!runStep) {
        return step.binding.kind === 'deferred'
          ? ['runtime-resolution-required']
          : step.binding.reasons;
      }
      return runStep.interpretation.kind === 'needs-human'
        ? [...step.binding.reasons, 'runtime-resolution-required']
        : step.binding.reasons;
    })(),
    reasons: step.binding.reasons,
    evidenceIds: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.evidenceIds ?? step.binding.evidenceIds,
    program: step.program ?? null,
    handshakes: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.handshakes ?? ['preparation'],
    winningConcern: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.winningConcern ?? 'intent',
    winningSource: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.winningSource ?? (step.resolution ? 'scenario-explicit' : step.binding.kind === 'deferred' ? 'none' : 'approved-knowledge'),
    resolutionMode: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.resolutionMode ?? 'deterministic',
    translation: latestRun?.steps.find((runStep) => runStep.stepIndex === step.index)?.interpretation.translation ?? null,
    runtime: runtimeStatusForStep(latestRun, step.index),
  }));
  const provenanceKinds = steps.reduce<Record<StepProvenanceKind, number>>(
    (counts, step) => ({ ...counts, [step.provenanceKind]: counts[step.provenanceKind] + 1 }),
    { explicit: 0, 'approved-knowledge': 0, 'live-exploration': 0, 'agent-interpreted': 0, unresolved: 0 },
  );
  const governance = steps.reduce<Record<Governance, number>>(
    (counts, step) => ({ ...counts, [step.governance]: counts[step.governance] + 1 }),
    { approved: 0, 'review-required': 0, blocked: 0 },
  );
  const allReasons = steps.flatMap((step) => step.unresolvedGaps);
  const unresolvedReasonCounts = allReasons.reduce<ReadonlyMap<string, number>>(
    (map, reason) => new Map([...map, [reason, (map.get(reason) ?? 0) + 1]]),
    new Map(),
  );
  const unresolvedReasons = [...unresolvedReasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
  const knowledgeHits = steps.filter((step) => step.provenanceKind === 'approved-knowledge').length;
  const translationHits = steps.filter((step) => step.resolutionMode === 'translation').length;

  const translationCacheEntries = steps
    .flatMap((step) => {
      const entry = step.translation?.cache;
      return entry ? [entry] : [];
    });
  const translationCacheHits = translationCacheEntries.filter((entry) => entry.status === 'hit').length;
  const translationMissReasons = translationCacheEntries
    .filter((entry) => entry.status !== 'hit')
    .reduce<Record<string, number>>((acc, entry) => {
      const reason = entry.reason ?? 'none';
      acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {});
  const translationFailureClasses = steps
    .map((step) => step.translation?.failureClass ?? 'none')
    .reduce<Record<string, number>>((acc, failureClass) => {
      acc[failureClass] = (acc[failureClass] ?? 0) + 1;
      return acc;
    }, {});
  const agenticHits = steps.filter((step) => step.resolutionMode === 'agentic').length;
  const liveExplorationHits = steps.filter((step) => step.provenanceKind === 'live-exploration').length;
  const degradedHits = steps.filter((step) => step.runtime?.degraded).length;
  const proposalCount = latestRun?.steps.reduce((count, step) => count + step.interpretation.proposalDrafts.length, 0) ?? 0;
  const reviewRequiredCount = steps.filter((step) => isReviewRequired(step)).length;
  const approvedEquivalentHits = steps.filter((step) => step.winningSource === 'approved-equivalent').length;
  const runtimeFailureFamilies = steps.reduce<Record<string, number>>((acc, step) => {
    const family = step.runtime?.failure?.family ?? 'none';
    acc[family] = (acc[family] ?? 0) + 1;
    return acc;
  }, {});
  const budgetBreaches = steps.filter((step) => step.runtime?.budget?.status === 'over-budget').length;
  const timingTotals = steps.reduce((acc, step) => {
    const timing = step.runtime?.timing;
    if (!timing) {
      return acc;
    }
    return {
      setupMs: acc.setupMs + timing.setupMs,
      resolutionMs: acc.resolutionMs + timing.resolutionMs,
      actionMs: acc.actionMs + timing.actionMs,
      assertionMs: acc.assertionMs + timing.assertionMs,
      retriesMs: acc.retriesMs + timing.retriesMs,
      teardownMs: acc.teardownMs + timing.teardownMs,
      totalMs: acc.totalMs + timing.totalMs,
    };
  }, {
    setupMs: 0,
    resolutionMs: 0,
    actionMs: 0,
    assertionMs: 0,
    retriesMs: 0,
    teardownMs: 0,
    totalMs: 0,
  });
  const avgInstructionCount = Number(((latestRun?.steps.reduce((sum, step) => sum + step.execution.cost.instructionCount, 0) ?? 0) / Math.max(steps.length, 1)).toFixed(2));
  const avgDiagnosticCount = Number(((latestRun?.steps.reduce((sum, step) => sum + step.execution.cost.diagnosticCount, 0) ?? 0) / Math.max(steps.length, 1)).toFixed(2));
  const rate = (value: number) => Number((steps.length === 0 ? 0 : value / steps.length).toFixed(2));

  return {
    adoId: boundScenario.source.ado_id,
    revision: boundScenario.source.revision,
    title: boundScenario.metadata.title,
    suite: boundScenario.metadata.suite,
    confidence: aggregateConfidence(boundScenario.steps.map((step) => step.confidence)),
    governance: aggregateScenarioGovernance(boundScenario, latestRun),
    lifecycle,
    diagnostics: boundScenario.diagnostics,
    summary: {
      stepCount: boundScenario.steps.length,
      provenanceKinds,
      governance,
      stageMetrics: {
        knowledgeHitRate: rate(knowledgeHits),
        translationHitRate: rate(translationHits),
        translationCacheHitRate: Number((translationCacheEntries.length === 0 ? 0 : translationCacheHits / translationCacheEntries.length).toFixed(2)),
        translationCacheMissReasons: translationMissReasons,
        translationFailureClasses,
        agenticHitRate: rate(agenticHits),
        liveExplorationRate: rate(liveExplorationHits),
        degradedLocatorRate: rate(degradedHits),
        proposalCount,
        reviewRequiredCount,
        approvedEquivalentRate: rate(approvedEquivalentHits),
        runtimeFailureFamilies,
        budgetBreachRate: rate(budgetBreaches),
        averageRuntimeCost: {
          instructionCount: avgInstructionCount,
          diagnosticCount: avgDiagnosticCount,
        },
        timing: timingTotals,
      },
      unresolvedReasons,
    },
    steps,
  };
}
