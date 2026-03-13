import { existsSync } from 'fs';
import { chromium, expect, test } from '@playwright/test';
import {
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createScreenId,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
  createWidgetId,
} from '../lib/domain/identity';
import type { StateTransitionGraph } from '../lib/domain/types';
import {
  observeStateRefsOnPage,
  observeTransitionOnPage,
  performSafeActiveEvent,
  primeRequiredStatesOnPage,
  type PlaywrightStateObservationContext,
} from '../lib/playwright/state-topology';

const chromiumExecutablePath = chromium.executablePath();

test.skip(
  !existsSync(chromiumExecutablePath),
  `Chromium executable not installed at ${chromiumExecutablePath}`,
);

function createPolicySearchObservationContext(): PlaywrightStateObservationContext {
  const screen = createScreenId('policy-search');
  const routeVariantRef = 'route-variant:demo:policy-search:default';
  const policyNumberTargetRef = createCanonicalTargetRef('target:element:policy-search:policyNumberInput');
  const searchButtonTargetRef = createCanonicalTargetRef('target:element:policy-search:searchButton');
  const resultsTableTargetRef = createCanonicalTargetRef('target:element:policy-search:resultsTable');
  const validationTargetRef = createCanonicalTargetRef('target:element:policy-search:validationSummary');

  const stateGraph: StateTransitionGraph = {
    kind: 'state-transition-graph',
    version: 1,
    generatedAt: '2026-03-12T00:00:00.000Z',
    fingerprint: 'sha256:policy-search-state-topology',
    stateRefs: [
      createStateNodeRef('state:policy-search:policy-number-cleared'),
      createStateNodeRef('state:policy-search:policy-number-populated'),
      createStateNodeRef('state:policy-search:results-hidden'),
      createStateNodeRef('state:policy-search:results-visible'),
      createStateNodeRef('state:policy-search:validation-hidden'),
      createStateNodeRef('state:policy-search:validation-visible'),
    ],
    eventSignatureRefs: [
      createEventSignatureRef('event:policy-search:enter-policy-number'),
      createEventSignatureRef('event:policy-search:click-search'),
    ],
    transitionRefs: [
      createTransitionRef('transition:policy-search:populate-policy-number'),
      createTransitionRef('transition:policy-search:hide-validation-on-input'),
      createTransitionRef('transition:policy-search:show-results'),
      createTransitionRef('transition:policy-search:show-validation'),
    ],
    states: [
      {
        ref: createStateNodeRef('state:policy-search:policy-number-cleared'),
        screen,
        label: 'Policy number is cleared',
        aliases: ['policy number empty'],
        scope: 'target',
        targetRef: policyNumberTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'cleared', targetRef: policyNumberTargetRef, attribute: 'value', value: '' }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createStateNodeRef('state:policy-search:policy-number-populated'),
        screen,
        label: 'Policy number is populated',
        aliases: ['policy number entered'],
        scope: 'target',
        targetRef: policyNumberTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'populated', targetRef: policyNumberTargetRef, attribute: 'value' }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createStateNodeRef('state:policy-search:results-hidden'),
        screen,
        label: 'Results are hidden',
        aliases: ['results hidden'],
        scope: 'target',
        targetRef: resultsTableTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'hidden', targetRef: resultsTableTargetRef }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createStateNodeRef('state:policy-search:results-visible'),
        screen,
        label: 'Results are visible',
        aliases: ['results visible'],
        scope: 'target',
        targetRef: resultsTableTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'visible', targetRef: resultsTableTargetRef }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createStateNodeRef('state:policy-search:validation-hidden'),
        screen,
        label: 'Validation is hidden',
        aliases: ['validation hidden'],
        scope: 'target',
        targetRef: validationTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'hidden', targetRef: validationTargetRef }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createStateNodeRef('state:policy-search:validation-visible'),
        screen,
        label: 'Validation is visible',
        aliases: ['validation visible'],
        scope: 'target',
        targetRef: validationTargetRef,
        routeVariantRefs: [routeVariantRef],
        predicates: [{ kind: 'visible', targetRef: validationTargetRef }],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
    ],
    eventSignatures: [
      {
        ref: createEventSignatureRef('event:policy-search:enter-policy-number'),
        screen,
        targetRef: policyNumberTargetRef,
        label: 'Enter policy number',
        aliases: ['enter policy number'],
        dispatch: { action: 'input', sampleValue: 'POL-001' },
        requiredStateRefs: [],
        forbiddenStateRefs: [],
        effects: {
          transitionRefs: [
            createTransitionRef('transition:policy-search:populate-policy-number'),
            createTransitionRef('transition:policy-search:hide-validation-on-input'),
          ],
          resultStateRefs: [
            createStateNodeRef('state:policy-search:policy-number-populated'),
            createStateNodeRef('state:policy-search:validation-hidden'),
          ],
          observableEffects: ['value-entry', 'validation-cleared'],
          assertions: [
            'Policy number field keeps the entered value',
            'Validation summary stays hidden after valid input',
          ],
        },
        observationPlan: {
          timeoutMs: 1500,
          settleMs: 50,
          observeStateRefs: [
            createStateNodeRef('state:policy-search:policy-number-populated'),
            createStateNodeRef('state:policy-search:validation-hidden'),
          ],
        },
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createEventSignatureRef('event:policy-search:click-search'),
        screen,
        targetRef: searchButtonTargetRef,
        label: 'Click search button',
        aliases: ['click search'],
        dispatch: { action: 'click' },
        requiredStateRefs: [createStateNodeRef('state:policy-search:policy-number-populated')],
        forbiddenStateRefs: [],
        effects: {
          transitionRefs: [
            createTransitionRef('transition:policy-search:show-results'),
            createTransitionRef('transition:policy-search:show-validation'),
          ],
          resultStateRefs: [
            createStateNodeRef('state:policy-search:results-visible'),
            createStateNodeRef('state:policy-search:results-hidden'),
            createStateNodeRef('state:policy-search:validation-visible'),
            createStateNodeRef('state:policy-search:validation-hidden'),
          ],
          observableEffects: ['result-set-visible', 'validation-visible'],
          assertions: [
            'Search yields either visible results or a visible validation summary',
            'Search keeps result and validation surfaces mutually exclusive',
          ],
        },
        observationPlan: {
          timeoutMs: 1500,
          settleMs: 50,
          observeStateRefs: [
            createStateNodeRef('state:policy-search:results-visible'),
            createStateNodeRef('state:policy-search:results-hidden'),
            createStateNodeRef('state:policy-search:validation-visible'),
            createStateNodeRef('state:policy-search:validation-hidden'),
          ],
        },
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
    ],
    transitions: [
      {
        ref: createTransitionRef('transition:policy-search:populate-policy-number'),
        screen,
        label: 'Populate policy number',
        aliases: ['populate policy number'],
        eventSignatureRef: createEventSignatureRef('event:policy-search:enter-policy-number'),
        sourceStateRefs: [createStateNodeRef('state:policy-search:policy-number-cleared')],
        targetStateRefs: [createStateNodeRef('state:policy-search:policy-number-populated')],
        effectKind: 'populate',
        observableEffects: ['value-entry'],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createTransitionRef('transition:policy-search:hide-validation-on-input'),
        screen,
        label: 'Hide validation on input',
        aliases: ['hide validation'],
        eventSignatureRef: createEventSignatureRef('event:policy-search:enter-policy-number'),
        sourceStateRefs: [createStateNodeRef('state:policy-search:validation-visible')],
        targetStateRefs: [createStateNodeRef('state:policy-search:validation-hidden')],
        effectKind: 'hide',
        observableEffects: ['validation-cleared'],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createTransitionRef('transition:policy-search:show-results'),
        screen,
        label: 'Show results',
        aliases: ['show results'],
        eventSignatureRef: createEventSignatureRef('event:policy-search:click-search'),
        sourceStateRefs: [createStateNodeRef('state:policy-search:policy-number-populated')],
        targetStateRefs: [
          createStateNodeRef('state:policy-search:results-visible'),
          createStateNodeRef('state:policy-search:validation-hidden'),
        ],
        effectKind: 'reveal',
        observableEffects: ['result-set-visible'],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
      {
        ref: createTransitionRef('transition:policy-search:show-validation'),
        screen,
        label: 'Show validation',
        aliases: ['show validation'],
        eventSignatureRef: createEventSignatureRef('event:policy-search:click-search'),
        sourceStateRefs: [createStateNodeRef('state:policy-search:policy-number-populated')],
        targetStateRefs: [
          createStateNodeRef('state:policy-search:validation-visible'),
          createStateNodeRef('state:policy-search:results-hidden'),
        ],
        effectKind: 'reveal',
        observableEffects: ['validation-visible'],
        provenance: ['knowledge/screens/policy-search.behavior.yaml'],
      },
    ],
    observations: [],
  };

  return {
    stateGraph,
    screens: [{
      screen,
      routeVariantRefs: [routeVariantRef],
      elements: [
        {
          element: createElementId('policyNumberInput'),
          targetRef: policyNumberTargetRef,
          role: 'textbox',
          name: 'Policy Number',
          locator: [{ kind: 'test-id', value: 'policy-number-input' }],
          widget: createWidgetId('os-input'),
          surface: createSurfaceId('search-form'),
        },
        {
          element: createElementId('searchButton'),
          targetRef: searchButtonTargetRef,
          role: 'button',
          name: 'Search',
          locator: [{ kind: 'test-id', value: 'search-button' }],
          widget: createWidgetId('os-button'),
          surface: createSurfaceId('search-form'),
        },
        {
          element: createElementId('resultsTable'),
          targetRef: resultsTableTargetRef,
          role: 'table',
          name: 'Search Results',
          locator: [{ kind: 'test-id', value: 'search-results-table' }],
          widget: createWidgetId('os-table'),
          surface: createSurfaceId('results-grid'),
        },
        {
          element: createElementId('validationSummary'),
          targetRef: validationTargetRef,
          role: 'alert',
          name: 'No matching policy found.',
          locator: [{ kind: 'test-id', value: 'validation-summary' }],
          widget: createWidgetId('os-validation-summary'),
          surface: createSurfaceId('search-form'),
        },
      ],
    }],
  };
}

function observedStateRefs(results: Array<{ stateRef: string; observed: boolean }>): string[] {
  return results.filter((entry) => entry.observed).map((entry) => entry.stateRef).sort((left, right) => left.localeCompare(right));
}

test('state topology observes the policy search input transition on the real page', async ({ page }) => {
  const context = createPolicySearchObservationContext();
  const enterPolicyNumber = context.stateGraph.eventSignatures.find((event) => event.ref === 'event:policy-search:enter-policy-number');

  expect(enterPolicyNumber).toBeTruthy();
  if (!enterPolicyNumber) {
    throw new Error('enter policy number event signature is required');
  }

  await page.goto('/policy-search.html');
  const before = await observeStateRefsOnPage({
    page,
    context,
    stateRefs: context.stateGraph.stateRefs,
    activeRouteVariantRefs: ['route-variant:demo:policy-search:default'],
  });

  expect(observedStateRefs(before)).toEqual(expect.arrayContaining([
    'state:policy-search:policy-number-cleared',
    'state:policy-search:results-hidden',
    'state:policy-search:validation-hidden',
  ]));

  await performSafeActiveEvent({
    page,
    context,
    eventSignature: enterPolicyNumber,
  });

  const observation = await observeTransitionOnPage({
    page,
    context,
    screen: createScreenId('policy-search'),
    eventSignatureRef: enterPolicyNumber.ref,
    expectedTransitionRefs: enterPolicyNumber.effects.transitionRefs,
    beforeObservedStateRefs: observedStateRefs(before).map((entry) => createStateNodeRef(entry)),
    activeRouteVariantRefs: ['route-variant:demo:policy-search:default'],
    source: 'runtime',
    actor: 'runtime-execution',
    observationId: 'test:policy-search:enter-policy-number',
  });

  expect(observation.classification).toBe('matched');
  expect(observation.transitionRef).toBe('transition:policy-search:populate-policy-number');
  expect(observation.observedStateRefs).toContain('state:policy-search:policy-number-populated');
});

test('state topology primes required states and classifies the search result transition', async ({ page }) => {
  const context = createPolicySearchObservationContext();
  const clickSearch = context.stateGraph.eventSignatures.find((event) => event.ref === 'event:policy-search:click-search');

  expect(clickSearch).toBeTruthy();
  if (!clickSearch) {
    throw new Error('click search event signature is required');
  }

  await page.goto('/policy-search.html');
  await primeRequiredStatesOnPage({
    page,
    context,
    eventSignature: clickSearch,
    activeRouteVariantRefs: ['route-variant:demo:policy-search:default'],
  });

  const primedStates = await observeStateRefsOnPage({
    page,
    context,
    stateRefs: [
      createStateNodeRef('state:policy-search:policy-number-populated'),
      createStateNodeRef('state:policy-search:validation-hidden'),
    ],
    activeRouteVariantRefs: ['route-variant:demo:policy-search:default'],
  });
  expect(observedStateRefs(primedStates)).toEqual(expect.arrayContaining([
    'state:policy-search:policy-number-populated',
    'state:policy-search:validation-hidden',
  ]));

  await performSafeActiveEvent({
    page,
    context,
    eventSignature: clickSearch,
  });

  const searchObservation = await observeTransitionOnPage({
    page,
    context,
    screen: createScreenId('policy-search'),
    eventSignatureRef: clickSearch.ref,
    expectedTransitionRefs: clickSearch.effects.transitionRefs,
    beforeObservedStateRefs: observedStateRefs(primedStates).map((entry) => createStateNodeRef(entry)),
    activeRouteVariantRefs: ['route-variant:demo:policy-search:default'],
    source: 'runtime',
    actor: 'runtime-execution',
    observationId: 'test:policy-search:click-search',
  });

  expect(searchObservation.classification).toBe('matched');
  expect(searchObservation.transitionRef).toBe('transition:policy-search:show-results');
  expect(searchObservation.observedStateRefs).toEqual(expect.arrayContaining([
    'state:policy-search:results-visible',
    'state:policy-search:validation-hidden',
  ]));
});
