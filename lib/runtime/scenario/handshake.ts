import { RuntimeError } from '../../domain/errors';
import type { HandshakeStageInput, ScenarioRunState, ScenarioStepHandshake } from './types';

export function stepHandshakeFromPlan(input: HandshakeStageInput): ScenarioStepHandshake {
  const step = input.plan.steps[input.zeroBasedIndex] ?? null;
  if (!step) {
    throw new RuntimeError('runtime-missing-run-plan-step', `Missing run plan step ${input.zeroBasedIndex + 1} for ${input.plan.adoId}`);
  }
  return {
    task: step,
    directive: undefined,
    resolutionContext: input.plan.resolutionContext,
  };
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
