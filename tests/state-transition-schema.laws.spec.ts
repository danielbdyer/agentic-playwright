import { expect, test } from '@playwright/test';
import { validateStateTransitionGraph } from '../lib/domain/validation/interface';
import { validateResolutionControl } from '../lib/domain/validation/core';

const validStateTransitionGraph = () => ({
  kind: 'state-transition-graph' as const,
  version: 1 as const,
  generatedAt: '2026-03-30T00:00:00.000Z',
  fingerprint: 'fp:state-transition-graph',
  stateRefs: ['state:idle'],
  eventSignatureRefs: ['event:submit'],
  transitionRefs: ['transition:submit-success'],
  states: [{
    ref: 'state:idle',
    screen: 'screen:checkout',
    label: 'Idle',
    aliases: [],
    scope: 'screen' as const,
    targetRef: null,
    routeVariantRefs: [],
    predicates: [{
      kind: 'visible' as const,
      targetRef: null,
      selectorRef: null,
      routeVariantRef: null,
      attribute: null,
      value: null,
      message: null,
    }],
    provenance: [],
  }],
  eventSignatures: [{
    ref: 'event:submit',
    screen: 'screen:checkout',
    targetRef: 'target:submit',
    label: 'Submit',
    aliases: [],
    dispatch: {
      action: 'click' as const,
      sampleValue: null,
    },
    requiredStateRefs: [],
    forbiddenStateRefs: [],
    effects: {
      transitionRefs: ['transition:submit-success'],
      resultStateRefs: ['state:idle'],
      observableEffects: ['submit-clicked'],
      assertions: ['submit-result-visible'],
    },
    observationPlan: {
      timeoutMs: null,
      settleMs: null,
      observeStateRefs: ['state:idle'],
    },
    provenance: [],
  }],
  transitions: [{
    ref: 'transition:submit-success',
    screen: 'screen:checkout',
    label: 'Submit succeeds',
    aliases: [],
    eventSignatureRef: 'event:submit',
    sourceStateRefs: ['state:idle'],
    targetStateRefs: ['state:idle'],
    effectKind: 'validate' as const,
    observableEffects: [],
    provenance: [],
  }],
  observations: [{
    observationId: 'observation:1',
    source: 'runtime' as const,
    actor: 'runtime-execution' as const,
    screen: 'screen:checkout',
    eventSignatureRef: 'event:submit',
    transitionRef: 'transition:submit-success',
    expectedTransitionRefs: ['transition:submit-success'],
    observedStateRefs: ['state:idle'],
    unexpectedStateRefs: [],
    confidence: 'observed' as const,
    classification: 'matched' as const,
    detail: { reason: 'round-trip test' },
  }],
});

test.describe('State transition graph schema migration laws', () => {
  test('Law: structural round-trip is stable for valid graphs', () => {
    const source = validStateTransitionGraph();
    const decoded = validateStateTransitionGraph(source);
    const reparsed = validateStateTransitionGraph(JSON.parse(JSON.stringify(decoded)));
    expect(reparsed).toEqual(decoded);
  });

  test('Law: semantic filter rejects event signatures referencing unknown transitions', () => {
    const invalid = validStateTransitionGraph();
    const [eventSignature] = invalid.eventSignatures;
    invalid.eventSignatures = [{
      ...eventSignature!,
      effects: {
        ...eventSignature!.effects,
        transitionRefs: ['transition:missing'],
      },
    }];
    expect(() => validateStateTransitionGraph(invalid)).toThrow();
  });
});

test.describe('Resolution artifact schema migration laws', () => {
  test('Law: resolution-control step resolution round-trips with schema defaults', () => {
    const input = {
      kind: 'resolution-control' as const,
      version: 1 as const,
      name: 'sample-control',
      selector: { adoIds: [], suites: ['suite-a'], tags: [] },
      steps: [{
        stepIndex: 0,
        resolution: {
          action: 'click',
          screen: 'screen:checkout',
          element: 'element:submit',
          posture: null,
          override: null,
          snapshot_template: null,
          route_state: null,
        },
      }],
    };
    const decoded = validateResolutionControl(input);
    expect(decoded.steps[0]?.resolution).toEqual(input.steps[0]?.resolution);
  });
});
