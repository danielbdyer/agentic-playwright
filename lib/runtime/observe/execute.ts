/**
 * Observation phase — read-only, zero side-effects on scenario state.
 *
 * Extracted from scenario.ts to be independently testable.
 * This module observes state refs before and after execution, and
 * checks state preconditions. All functions are pure: they return
 * new data rather than mutating inputs.
 */

import type { StateNodeRef, TransitionRef } from '../../domain/identity';
import type {
  GroundedStep,
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionReceipt,
  ResolutionTarget,
  TransitionObservation,
} from '../../domain/types';
import { uniqueSorted } from '../../domain/collections';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ObservationInput {
  readonly task: GroundedStep;
  readonly activeRouteVariantRefs: readonly string[];
  readonly observedStateSession: ObservedStateSession;
}

export interface PreExecutionObservation {
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly missingRequiredStates: readonly StateNodeRef[];
  readonly forbiddenActiveStates: readonly StateNodeRef[];
  readonly preconditionsMet: boolean;
}

export interface PostExecutionObservation {
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly matchedTransitionRefs: readonly TransitionRef[];
  readonly transitionObservations: readonly TransitionObservation[];
}

export interface TransitionInferenceInput {
  readonly task: GroundedStep;
  readonly interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
  readonly success: boolean;
}

// ─── Pure observation functions ──────────────────────────────────────────

/**
 * Compute the relevant state refs for a task by combining required, forbidden,
 * and result state refs into a unique sorted set.
 */
export function relevantStateRefs(task: GroundedStep): readonly StateNodeRef[] {
  return uniqueSorted([
    ...task.grounding.requiredStateRefs,
    ...task.grounding.forbiddenStateRefs,
    ...task.grounding.resultStateRefs,
  ]);
}

/**
 * Derive the active route variant refs: prefer the observed session's refs
 * if non-empty, otherwise fall back to the task's grounding refs.
 */
export function activeRouteVariantRefs(
  session: ObservedStateSession,
  task: GroundedStep,
): readonly string[] {
  return session.activeRouteVariantRefs.length > 0
    ? session.activeRouteVariantRefs
    : task.grounding.routeVariantRefs;
}

/**
 * Pre-execution observation: given observed state refs (from page or session),
 * check state preconditions. Pure — no page interaction.
 */
export function observePreExecution(
  task: GroundedStep,
  observedStateRefs: readonly StateNodeRef[],
  target: ResolutionTarget,
): PreExecutionObservation {
  const beforeSet = new Set(observedStateRefs);
  const skipStatePreconditions = target.action === 'navigate';

  const missingRequiredStates = skipStatePreconditions
    ? []
    : task.grounding.requiredStateRefs.filter((ref) => !beforeSet.has(ref));

  const forbiddenActiveStates = skipStatePreconditions
    ? []
    : task.grounding.forbiddenStateRefs.filter((ref) => beforeSet.has(ref));

  return {
    observedStateRefs,
    missingRequiredStates,
    forbiddenActiveStates,
    preconditionsMet: missingRequiredStates.length === 0 && forbiddenActiveStates.length === 0,
  };
}

/**
 * Fallback observation when no live page is available: filter the session's
 * active state refs to those relevant for the current task.
 */
export function observeStateRefsFromSession(
  session: ObservedStateSession,
  stateRefs: readonly StateNodeRef[],
): readonly StateNodeRef[] {
  const relevant = new Set(stateRefs);
  return session.activeStateRefs.filter((ref) => relevant.has(ref));
}

/**
 * Infer transition observations from static information (no live page).
 * Pure derivation based on grounding and execution success.
 */
export function inferTransitionObservations(
  input: TransitionInferenceInput,
): readonly TransitionObservation[] {
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

/**
 * Post-execution observation: derive observed state refs and matched transition
 * refs from transition observations. Pure.
 */
export function observePostExecution(
  transitionObservations: readonly TransitionObservation[],
  task: GroundedStep,
): PostExecutionObservation {
  const observedStateRefs = uniqueSorted(
    transitionObservations.flatMap((entry) => entry.observedStateRefs),
  );
  const matchedTransitionRefs = uniqueSorted(
    transitionObservations
      .flatMap((entry) => entry.classification === 'matched' && entry.transitionRef ? [entry.transitionRef] : []),
  );

  return {
    observedStateRefs,
    matchedTransitionRefs,
    transitionObservations,
  };
}
