import { expect, test } from '@playwright/test';
import {
  advanceScenarioRunState,
  createScenarioRunState,
  inferTransitionObservations,
  type ScenarioRunState,
} from '../product/domain/aggregates/runtime-scenario-run';
import type { GroundedStep, ResolutionReceipt } from '../product/domain/resolution/types';
import { createScreenId, createStateNodeRef, createTransitionRef } from '../product/domain/kernel/identity';

function groundedStep(overrides: Partial<GroundedStep> = {}): GroundedStep {
  return {
    index: 1,
    intent: 'Navigate to claims',
    actionText: 'Open claims page',
    expectedText: 'Claims page is visible',
    normalizedIntent: 'open claims page',
    taskFingerprint: 'sha256:task-1',
    grounding: {
      targetRefs: ['target:claims'],
      routeVariantRefs: ['route:claims-default'],
      requiredStateRefs: [createStateNodeRef('state:auth')],
      forbiddenStateRefs: [createStateNodeRef('state:maintenance')],
      resultStateRefs: [createStateNodeRef('state:claims')],
      eventSignatureRefs: ['event:open-claims'],
      expectedTransitionRefs: [createTransitionRef('transition:to-claims')],
      effectAssertions: [],
    },
    ...overrides,
  } as GroundedStep;
}

function resolvedReceipt(overrides: Partial<Exclude<ResolutionReceipt, { kind: 'needs-human' }>> = {}): Exclude<ResolutionReceipt, { kind: 'needs-human' }> {
  return {
    kind: 'resolved',
    confidence: 'compiler-derived',
    winningSource: 'approved-screen-knowledge',
    rationale: 'deterministic resolution',
    target: {
      action: 'click',
      screen: createScreenId('claims'),
      element: 'claimsLink' as never,
      posture: null,
      override: null,
      snapshot_template: null,
    },
    ...overrides,
  } as Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
}

test('state transition is deterministic for identical inputs', () => {
  const state = createScenarioRunState();
  const task = groundedStep();
  const interpretation = resolvedReceipt();

  const nextA = advanceScenarioRunState({
    state,
    task,
    interpretation,
    observedStateRefs: [createStateNodeRef('state:claims')],
    transitionRefs: [createTransitionRef('transition:to-claims')],
  });

  const nextB = advanceScenarioRunState({
    state,
    task,
    interpretation,
    observedStateRefs: [createStateNodeRef('state:claims')],
    transitionRefs: [createTransitionRef('transition:to-claims')],
  });

  expect(nextA).toEqual(nextB);
});

test('precedence preservation: observed relevant states override prior relevant states but keep unrelated states', () => {
  const base: ScenarioRunState = {
    previousResolution: null,
    observedStateSession: {
      ...createScenarioRunState().observedStateSession,
      activeStateRefs: [createStateNodeRef('state:auth'), createStateNodeRef('state:unrelated')],
      lineage: ['seed:lineage'],
    },
  };

  const next = advanceScenarioRunState({
    state: base,
    task: groundedStep(),
    interpretation: resolvedReceipt(),
    observedStateRefs: [createStateNodeRef('state:claims')],
    transitionRefs: [createTransitionRef('transition:to-claims')],
  });

  expect(next.observedStateSession.activeStateRefs).toEqual([createStateNodeRef('state:claims'), createStateNodeRef('state:unrelated')]);
  expect(next.previousResolution).toEqual(resolvedReceipt().target);
});

test('transition inference is deterministic and stable for identical input', () => {
  const task = groundedStep();
  const interpretation = resolvedReceipt();

  const left = inferTransitionObservations({ task, interpretation, success: true });
  const right = inferTransitionObservations({ task, interpretation, success: true });

  expect(left).toEqual(right);
  expect(left[0]?.classification).toBe('matched');
});
