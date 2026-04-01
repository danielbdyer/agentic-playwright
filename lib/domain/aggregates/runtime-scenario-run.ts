import { uniqueSorted } from '../kernel/collections';
import type {
  GroundedStep,
  ResolutionReceipt,
  TransitionObservation,
  ObservedStateSession,
} from '../types';
import type { StateNodeRef, TransitionRef } from '../kernel/identity';

export interface ScenarioRunState {
  previousResolution: import('../types').ResolutionTarget | null;
  observedStateSession: ObservedStateSession;
}

export function createScenarioRunState(): ScenarioRunState {
  return {
    previousResolution: null,
    observedStateSession: {
      currentScreen: null,
      activeStateRefs: [],
      lastObservedTransitionRefs: [],
      activeRouteVariantRefs: [],
      activeTargetRefs: [],
      lastSuccessfulLocatorRung: null,
      recentAssertions: [],
      causalLinks: [],
      lineage: [],
    },
  };
}

function relevantStateRefs(task: GroundedStep): readonly StateNodeRef[] {
  return uniqueSorted([
    ...task.grounding.requiredStateRefs,
    ...task.grounding.forbiddenStateRefs,
    ...task.grounding.resultStateRefs,
  ]);
}

export function inferTransitionObservations(input: {
  readonly task: GroundedStep;
  readonly interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
  readonly success: boolean;
}): readonly TransitionObservation[] {
  if (input.task.grounding.expectedTransitionRefs.length === 0) {
    return [];
  }

  const observedStateRefs = input.success ? input.task.grounding.resultStateRefs : [];
  return [{
    observationId: `runtime:${input.task.index}:${input.interpretation.target.action}`,
    source: 'runtime',
    actor: 'runtime-execution',
    screen: input.interpretation.target.screen,
    eventSignatureRef: input.task.grounding.eventSignatureRefs[0] ?? null,
    transitionRef: input.task.grounding.expectedTransitionRefs.length === 1 ? input.task.grounding.expectedTransitionRefs[0]! : null,
    expectedTransitionRefs: input.task.grounding.expectedTransitionRefs,
    observedStateRefs,
    unexpectedStateRefs: [],
    confidence: input.success ? 'inferred' : 'missing',
    classification: input.success ? 'matched' : 'missing-expected',
    detail: {
      mode: 'static-inference',
      result: input.success ? 'ok' : 'failed',
    },
  }];
}

export function advanceScenarioRunState(input: {
  readonly state: ScenarioRunState;
  readonly task: GroundedStep;
  readonly interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly transitionRefs: readonly TransitionRef[];
}): ScenarioRunState {
  const relevant = new Set(relevantStateRefs(input.task));
  const nextObservedStateSession: ObservedStateSession = {
    ...input.state.observedStateSession,
    currentScreen: {
      screen: input.interpretation.target.screen,
      confidence: input.interpretation.confidence === 'compiler-derived' ? 1 : 0.8,
      observedAtStep: input.task.index,
    },
    activeStateRefs: uniqueSorted([
      ...input.state.observedStateSession.activeStateRefs.filter((ref) => !relevant.has(ref)),
      ...input.observedStateRefs,
    ]),
    lastObservedTransitionRefs: uniqueSorted(input.transitionRefs),
    activeRouteVariantRefs: uniqueSorted([
      ...input.state.observedStateSession.activeRouteVariantRefs,
      ...input.task.grounding.routeVariantRefs,
    ]),
    activeTargetRefs: uniqueSorted([
      ...input.state.observedStateSession.activeTargetRefs,
      ...input.task.grounding.targetRefs,
    ]),
    lineage: uniqueSorted([
      ...input.state.observedStateSession.lineage,
      `step:${input.task.index}`,
      `screen:${input.interpretation.target.screen}`,
      ...input.transitionRefs.map((ref) => `transition:${ref}`),
      ...input.observedStateRefs.map((ref) => `state:${ref}`),
    ]).slice(-48),
  };

  return {
    previousResolution: input.interpretation.target,
    observedStateSession: nextObservedStateSession,
  };
}
