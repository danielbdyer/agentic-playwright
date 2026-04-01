// Pure graph pathfinding for state-transition execution planning.
// Moved from lib/application/execution/planner.ts — no Effect, Playwright, or IO dependencies.

import type { EventSignatureRef, StateNodeRef, TransitionRef } from '../kernel/identity';
import type { StateTransitionGraph } from '../types';
import { uniqueSorted } from '../kernel/collections';

export interface PlannedTransitionEdge {
  readonly transitionRef: TransitionRef;
  readonly eventSignatureRef: EventSignatureRef;
  readonly sourceStateRefs: readonly StateNodeRef[];
  readonly targetStateRefs: readonly StateNodeRef[];
}

export interface PlannedTransitionStep {
  readonly depth: number;
  readonly transitionRef: TransitionRef;
  readonly eventSignatureRef: EventSignatureRef;
  readonly fromStateRefs: readonly StateNodeRef[];
  readonly toStateRefs: readonly StateNodeRef[];
}

export interface PlannedExecutionStep {
  readonly requiredPreconditions: readonly StateNodeRef[];
  readonly forbiddenPreconditions: readonly StateNodeRef[];
  readonly availableTransitions: readonly PlannedTransitionEdge[];
  readonly chosenTransitionPath: readonly PlannedTransitionStep[];
  readonly projectedSatisfiedStateRefs: readonly StateNodeRef[];
  readonly status: 'already-satisfied' | 'path-found' | 'no-path' | 'not-applicable';
  readonly failure?: {
    readonly code: 'runtime-state-precondition-unreachable';
    readonly message: string;
    readonly missingRequiredStates: readonly StateNodeRef[];
    readonly forbiddenActiveStates: readonly StateNodeRef[];
  } | undefined;
}

function canonicalStateKey(stateRefs: readonly StateNodeRef[]): string {
  return uniqueSorted(stateRefs).join('|');
}

function evaluatePreconditions(input: {
  activeStateRefs: readonly StateNodeRef[];
  requiredStateRefs: readonly StateNodeRef[];
  forbiddenStateRefs: readonly StateNodeRef[];
}) {
  const activeSet = new Set(input.activeStateRefs);
  const missingRequiredStates = input.requiredStateRefs.filter((ref) => !activeSet.has(ref));
  const forbiddenActiveStates = input.forbiddenStateRefs.filter((ref) => activeSet.has(ref));
  return {
    missingRequiredStates,
    forbiddenActiveStates,
    satisfied: missingRequiredStates.length === 0 && forbiddenActiveStates.length === 0,
  };
}

function sortTransitionsDeterministically(transitions: readonly PlannedTransitionEdge[]): readonly PlannedTransitionEdge[] {
  return [...transitions].sort((left, right) => {
    const transitionCompare = String(left.transitionRef).localeCompare(String(right.transitionRef));
    return transitionCompare !== 0
      ? transitionCompare
      : String(left.eventSignatureRef).localeCompare(String(right.eventSignatureRef));
  });
}

function applyTransition(stateRefs: readonly StateNodeRef[], transition: PlannedTransitionEdge): readonly StateNodeRef[] {
  const source = new Set(transition.sourceStateRefs);
  return uniqueSorted([
    ...stateRefs.filter((ref) => !source.has(ref)),
    ...transition.targetStateRefs,
  ]);
}

function transitionApplicable(stateRefs: readonly StateNodeRef[], transition: PlannedTransitionEdge): boolean {
  const active = new Set(stateRefs);
  return transition.sourceStateRefs.every((ref) => active.has(ref));
}

function findShortestPath(input: {
  initialStateRefs: readonly StateNodeRef[];
  requiredStateRefs: readonly StateNodeRef[];
  forbiddenStateRefs: readonly StateNodeRef[];
  transitions: readonly PlannedTransitionEdge[];
  maxDepth: number;
}): readonly PlannedTransitionStep[] | null {
  const initial = uniqueSorted(input.initialStateRefs);
  const checkInitial = evaluatePreconditions({
    activeStateRefs: initial,
    requiredStateRefs: input.requiredStateRefs,
    forbiddenStateRefs: input.forbiddenStateRefs,
  });
  if (checkInitial.satisfied) {
    return [];
  }

  type FrontierNode = {
    readonly stateRefs: readonly StateNodeRef[];
    readonly path: readonly PlannedTransitionStep[];
  };

  const sortedTransitions = sortTransitionsDeterministically(input.transitions);
  const visited = new Set<string>([canonicalStateKey(initial)]);

  const walk = (frontier: readonly FrontierNode[]): readonly PlannedTransitionStep[] | null => {
    if (frontier.length === 0) {
      return null;
    }

    const nextFrontier = frontier.flatMap((node) => {
      if (node.path.length >= input.maxDepth) {
        return [];
      }
      return sortedTransitions
        .filter((transition) => transitionApplicable(node.stateRefs, transition))
        .flatMap((transition) => {
          const nextStateRefs = applyTransition(node.stateRefs, transition);
          const nextKey = canonicalStateKey(nextStateRefs);
          if (visited.has(nextKey)) {
            return [];
          }
          visited.add(nextKey);
          const step: PlannedTransitionStep = {
            depth: node.path.length + 1,
            transitionRef: transition.transitionRef,
            eventSignatureRef: transition.eventSignatureRef,
            fromStateRefs: node.stateRefs,
            toStateRefs: nextStateRefs,
          };
          return [{ stateRefs: nextStateRefs, path: [...node.path, step] }];
        });
    });

    const winner = nextFrontier.find((node) =>
      evaluatePreconditions({
        activeStateRefs: node.stateRefs,
        requiredStateRefs: input.requiredStateRefs,
        forbiddenStateRefs: input.forbiddenStateRefs,
      }).satisfied,
    );
    return winner ? winner.path : walk(nextFrontier);
  };

  return walk([{ stateRefs: initial, path: [] }]);
}

function toTransitionEdges(graph: StateTransitionGraph): readonly PlannedTransitionEdge[] {
  return graph.transitions.map((transition) => ({
    transitionRef: transition.ref,
    eventSignatureRef: transition.eventSignatureRef,
    sourceStateRefs: uniqueSorted(transition.sourceStateRefs),
    targetStateRefs: uniqueSorted(transition.targetStateRefs),
  }));
}

export function planExecutionStep(input: {
  stateGraph: StateTransitionGraph | null | undefined;
  activeStateRefs: readonly StateNodeRef[];
  requiredStateRefs: readonly StateNodeRef[];
  forbiddenStateRefs: readonly StateNodeRef[];
  skipPreconditions?: boolean | undefined;
  maxDepth?: number | undefined;
}): PlannedExecutionStep {
  const requiredPreconditions = uniqueSorted(input.requiredStateRefs);
  const forbiddenPreconditions = uniqueSorted(input.forbiddenStateRefs);
  const activeStateRefs = uniqueSorted(input.activeStateRefs);

  if (input.skipPreconditions) {
    return {
      requiredPreconditions,
      forbiddenPreconditions,
      availableTransitions: [],
      chosenTransitionPath: [],
      projectedSatisfiedStateRefs: activeStateRefs,
      status: 'already-satisfied',
    };
  }

  if (!input.stateGraph) {
    const evaluation = evaluatePreconditions({
      activeStateRefs,
      requiredStateRefs: requiredPreconditions,
      forbiddenStateRefs: forbiddenPreconditions,
    });
    return {
      requiredPreconditions,
      forbiddenPreconditions,
      availableTransitions: [],
      chosenTransitionPath: [],
      projectedSatisfiedStateRefs: activeStateRefs,
      status: evaluation.satisfied ? 'already-satisfied' : 'not-applicable',
      ...(evaluation.satisfied
        ? {}
        : {
          failure: {
            code: 'runtime-state-precondition-unreachable' as const,
            message: 'No state graph available to satisfy preconditions.',
            missingRequiredStates: evaluation.missingRequiredStates,
            forbiddenActiveStates: evaluation.forbiddenActiveStates,
          },
        }),
    };
  }

  const availableTransitions = toTransitionEdges(input.stateGraph);
  const path = findShortestPath({
    initialStateRefs: activeStateRefs,
    requiredStateRefs: requiredPreconditions,
    forbiddenStateRefs: forbiddenPreconditions,
    transitions: availableTransitions,
    maxDepth: input.maxDepth ?? 6,
  });
  const projectedSatisfiedStateRefs = path && path.length > 0
    ? path[path.length - 1]!.toStateRefs
    : activeStateRefs;

  if (path === null) {
    const evaluation = evaluatePreconditions({
      activeStateRefs,
      requiredStateRefs: requiredPreconditions,
      forbiddenStateRefs: forbiddenPreconditions,
    });
    return {
      requiredPreconditions,
      forbiddenPreconditions,
      availableTransitions,
      chosenTransitionPath: [],
      projectedSatisfiedStateRefs: activeStateRefs,
      status: 'no-path',
      failure: {
        code: 'runtime-state-precondition-unreachable',
        message: 'No transition path can satisfy required preconditions.',
        missingRequiredStates: evaluation.missingRequiredStates,
        forbiddenActiveStates: evaluation.forbiddenActiveStates,
      },
    };
  }

  return {
    requiredPreconditions,
    forbiddenPreconditions,
    availableTransitions,
    chosenTransitionPath: path,
    projectedSatisfiedStateRefs,
    status: path.length === 0 ? 'already-satisfied' : 'path-found',
  };
}
