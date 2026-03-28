import { uniqueSorted } from '../../domain/collections';
import type { StateNodeRef } from '../../domain/identity';
import type {
  GroundedStep,
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionReceipt,
  TransitionObservation,
} from '../../domain/types';

// ─── Observation Phase ───
//
// The observation phase is read-only: it inspects the current state of the
// scenario environment without mutating scenario state or resolution state.
// It produces an ObservationResult that downstream phases consume.
//
// Extracting observation as a first-class phase makes it independently
// testable and composable with the execution phase.

/** Input to the observation phase — everything needed to observe pre-step state. */
export interface ObservationInput {
  readonly task: GroundedStep;
  readonly interpretation: ResolutionReceipt;
  readonly observedStateSession: ObservedStateSession;
  readonly activeRouteVariantRefs: readonly string[];
}

/** The pure result of the observation phase — no side effects. */
export interface ObservationResult {
  readonly relevantStateRefs: readonly StateNodeRef[];
  readonly beforeObservedStateRefs: readonly StateNodeRef[];
  readonly missingRequiredStates: readonly StateNodeRef[];
  readonly forbiddenActiveStates: readonly StateNodeRef[];
  readonly preconditionsSatisfied: boolean;
}

/**
 * Compute the union of required, forbidden, and result state refs for a step.
 * Pure function — no side effects.
 */
export function computeRelevantStateRefs(task: GroundedStep): readonly StateNodeRef[] {
  return uniqueSorted([
    ...task.grounding.requiredStateRefs,
    ...task.grounding.forbiddenStateRefs,
    ...task.grounding.resultStateRefs,
  ]);
}

/**
 * Determine which route variant refs to use based on session state.
 * Pure function — prefers session-observed variants, falls back to task grounding.
 */
export function computeActiveRouteVariantRefs(
  session: ObservedStateSession,
  task: GroundedStep,
): readonly string[] {
  return session.activeRouteVariantRefs.length > 0
    ? session.activeRouteVariantRefs
    : task.grounding.routeVariantRefs;
}

/**
 * Evaluate pre-step state preconditions against observed state refs.
 * Pure function: takes the set of observed state refs and the task grounding,
 * returns which preconditions are violated.
 *
 * Navigate actions skip state preconditions (the page is about to change).
 */
export function evaluateStatePreconditions(
  task: GroundedStep,
  beforeObservedStateRefs: readonly StateNodeRef[],
  action: string,
): Pick<ObservationResult, 'missingRequiredStates' | 'forbiddenActiveStates' | 'preconditionsSatisfied'> {
  const skipStatePreconditions = action === 'navigate';
  const beforeSet = new Set(beforeObservedStateRefs);
  const missingRequiredStates = skipStatePreconditions
    ? []
    : task.grounding.requiredStateRefs.filter((ref) => !beforeSet.has(ref));
  const forbiddenActiveStates = skipStatePreconditions
    ? []
    : task.grounding.forbiddenStateRefs.filter((ref) => beforeSet.has(ref));
  return {
    missingRequiredStates,
    forbiddenActiveStates,
    preconditionsSatisfied: missingRequiredStates.length === 0 && forbiddenActiveStates.length === 0,
  };
}

/**
 * Execute the full observation phase using only in-memory state (no live page).
 * Pure function: filters the session's active state refs against the relevant set.
 */
export function executeStaticObservation(input: ObservationInput): ObservationResult {
  if (input.interpretation.kind === 'needs-human') {
    return {
      relevantStateRefs: computeRelevantStateRefs(input.task),
      beforeObservedStateRefs: [],
      missingRequiredStates: [],
      forbiddenActiveStates: [],
      preconditionsSatisfied: false,
    };
  }

  const relevantStateRefs = computeRelevantStateRefs(input.task);
  const beforeObservedStateRefs = input.observedStateSession.activeStateRefs
    .filter((ref) => relevantStateRefs.includes(ref));
  const preconditions = evaluateStatePreconditions(
    input.task,
    beforeObservedStateRefs,
    input.interpretation.target.action,
  );

  return {
    relevantStateRefs,
    beforeObservedStateRefs,
    ...preconditions,
  };
}

/**
 * Infer transition observations from step execution results.
 * Pure function: no page interaction, deterministic output.
 */
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
    transitionRef: input.task.grounding.expectedTransitionRefs.length === 1
      ? input.task.grounding.expectedTransitionRefs[0]!
      : null,
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
