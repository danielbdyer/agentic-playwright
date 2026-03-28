import { expect, test } from '@playwright/test';
import { createEventSignatureRef, createScreenId, createStateNodeRef, createTransitionRef } from '../lib/domain/identity';
import type { StateTransitionGraph } from '../lib/domain/types';
import { planExecutionStep } from '../lib/application/execution/planner';
import { dataResolutionPrecedenceLaw, resolutionPrecedenceLaw, runSelectionPrecedenceLaw } from '../lib/domain/precedence';

const stateA = createStateNodeRef('state:a');
const stateB = createStateNodeRef('state:b');
const stateC = createStateNodeRef('state:c');

function createGraph(transitions: ReadonlyArray<{
  ref: string;
  event: string;
  source: readonly ReturnType<typeof createStateNodeRef>[];
  target: readonly ReturnType<typeof createStateNodeRef>[];
}>): StateTransitionGraph {
  return {
    kind: 'state-transition-graph',
    version: 1,
    generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    fingerprint: 'graph:planner-test',
    stateRefs: [stateA, stateB, stateC],
    eventSignatureRefs: transitions.map((entry) => createEventSignatureRef(entry.event)),
    transitionRefs: transitions.map((entry) => createTransitionRef(entry.ref)),
    states: [] as StateTransitionGraph['states'],
    eventSignatures: [] as StateTransitionGraph['eventSignatures'],
    transitions: transitions.map((entry) => ({
      ref: createTransitionRef(entry.ref),
      screen: createScreenId('screen:test'),
      label: entry.ref,
      aliases: [],
      eventSignatureRef: createEventSignatureRef(entry.event),
      sourceStateRefs: entry.source,
      targetStateRefs: entry.target,
      effectKind: 'reveal',
      observableEffects: [],
      provenance: ['test'],
    })),
    observations: [],
  };
}

test.describe('Execution planner laws', () => {
  test('deterministic plan under candidate permutation', () => {
    const graphA = createGraph([
      { ref: 'transition:z-direct', event: 'event:z-direct', source: [stateA], target: [stateC] },
      { ref: 'transition:a-hop', event: 'event:a-hop', source: [stateA], target: [stateB] },
      { ref: 'transition:b-hop', event: 'event:b-hop', source: [stateB], target: [stateC] },
    ]);
    const graphB = createGraph([
      { ref: 'transition:b-hop', event: 'event:b-hop', source: [stateB], target: [stateC] },
      { ref: 'transition:a-hop', event: 'event:a-hop', source: [stateA], target: [stateB] },
      { ref: 'transition:z-direct', event: 'event:z-direct', source: [stateA], target: [stateC] },
    ]);

    const plannedA = planExecutionStep({
      stateGraph: graphA,
      activeStateRefs: [stateA],
      requiredStateRefs: [stateC],
      forbiddenStateRefs: [],
      maxDepth: 4,
    });
    const plannedB = planExecutionStep({
      stateGraph: graphB,
      activeStateRefs: [stateA],
      requiredStateRefs: [stateC],
      forbiddenStateRefs: [],
      maxDepth: 4,
    });

    expect(plannedA.status).toBe('path-found');
    expect(plannedB.status).toBe('path-found');
    expect(plannedA.chosenTransitionPath.map((entry) => String(entry.transitionRef))).toEqual(
      plannedB.chosenTransitionPath.map((entry) => String(entry.transitionRef)),
    );
    expect(plannedA.chosenTransitionPath.length).toBe(1);
    expect(String(plannedA.chosenTransitionPath[0]!.transitionRef)).toBe('transition:z-direct');
  });

  test('monotonic behavior when additional valid transitions are added', () => {
    const base = planExecutionStep({
      stateGraph: createGraph([
        { ref: 'transition:a-hop', event: 'event:a-hop', source: [stateA], target: [stateB] },
        { ref: 'transition:b-hop', event: 'event:b-hop', source: [stateB], target: [stateC] },
      ]),
      activeStateRefs: [stateA],
      requiredStateRefs: [stateC],
      forbiddenStateRefs: [],
      maxDepth: 5,
    });
    const extended = planExecutionStep({
      stateGraph: createGraph([
        { ref: 'transition:a-hop', event: 'event:a-hop', source: [stateA], target: [stateB] },
        { ref: 'transition:b-hop', event: 'event:b-hop', source: [stateB], target: [stateC] },
        { ref: 'transition:z-direct', event: 'event:z-direct', source: [stateA], target: [stateC] },
      ]),
      activeStateRefs: [stateA],
      requiredStateRefs: [stateC],
      forbiddenStateRefs: [],
      maxDepth: 5,
    });

    expect(base.status).toBe('path-found');
    expect(extended.status).toBe('path-found');
    expect(extended.chosenTransitionPath.length).toBeLessThanOrEqual(base.chosenTransitionPath.length);
  });

  test('no change to precedence laws for non-state concerns', () => {
    expect([...resolutionPrecedenceLaw]).toEqual([
      'explicit',
      'control',
      'approved-screen-knowledge',
      'shared-patterns',
      'prior-evidence',
      'approved-equivalent-overlay',
      'structured-translation',
      'live-dom',
      'agent-interpreted',
      'needs-human',
    ]);
    expect([...dataResolutionPrecedenceLaw]).toEqual([
      'explicit',
      'runbook-dataset-binding',
      'dataset-default',
      'hint-default-value',
      'posture-sample',
      'generated-token',
    ]);
    expect([...runSelectionPrecedenceLaw]).toEqual([
      'cli-flag',
      'runbook',
      'repo-default',
    ]);
  });
});
