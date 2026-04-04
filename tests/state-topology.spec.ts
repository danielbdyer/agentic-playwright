import { existsSync } from 'fs';
import { chromium, expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  createCanonicalTargetRef,
  createElementId,
  createEventSignatureRef,
  createScreenId,
  createStateNodeRef,
  createSurfaceId,
  createTransitionRef,
  createWidgetId,
} from '../lib/domain/kernel/identity';
import type { StateTransitionGraph } from '../lib/domain/target/interface-graph';
import {
  observeStateRefsOnPage,
  observeTransitionOnPage,
  performSafeActiveEvent,
  primeRequiredStatesOnPage,
  type PlaywrightStateObservationContext,
} from '../lib/playwright/state-topology';

const chromiumExecutablePath = chromium.executablePath();
const hasChromiumInstalled = existsSync(chromiumExecutablePath);

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDelayedMockPage(options: {
  readonly delayMs: number;
  readonly valuesByTestId: Readonly<Record<string, string>>;
}): Page {
  const createLocator = (testId: string): Locator => ({
    count: async () => {
      await wait(options.delayMs);
      return options.valuesByTestId[testId] !== undefined ? 1 : 0;
    },
    isVisible: async () => {
      await wait(options.delayMs);
      return options.valuesByTestId[testId] !== undefined;
    },
    isEnabled: async () => {
      await wait(options.delayMs);
      return true;
    },
    textContent: async () => {
      await wait(options.delayMs);
      return options.valuesByTestId[testId] ?? null;
    },
    inputValue: async () => {
      await wait(options.delayMs);
      return options.valuesByTestId[testId] ?? '';
    },
    getAttribute: async () => {
      await wait(options.delayMs);
      return null;
    },
  } as unknown as Locator);

  return {
    getByTestId: (testId: string) => createLocator(testId),
    getByRole: () => createLocator(''),
    locator: () => createLocator(''),
    url: () => 'https://example.test/policy-search',
  } as unknown as Page;
}

function createSyntheticObservationContext(stateCount: number): PlaywrightStateObservationContext {
  const screen = createScreenId('synthetic-screen');
  const stateRefs = Array.from({ length: stateCount }, (_, index) => createStateNodeRef(`state:synthetic:${String(index).padStart(2, '0')}`));
  const eventRef = createEventSignatureRef('event:synthetic:noop');
  const transitionRef = createTransitionRef('transition:synthetic:visible');
  const sharedRouteVariantRef = 'route-variant:demo:synthetic:default';

  return {
    stateGraph: {
      kind: 'state-transition-graph',
      version: 1,
      generatedAt: '2026-03-30T00:00:00.000Z',
      fingerprint: 'sha256:synthetic',
      stateRefs,
      eventSignatureRefs: [eventRef],
      transitionRefs: [transitionRef],
      states: stateRefs.map((stateRef, index) => {
        const targetRef = createCanonicalTargetRef(`target:element:synthetic:field-${index}`);
        return {
          ref: stateRef,
          screen,
          label: `Synthetic state ${index}`,
          aliases: [],
          scope: 'target',
          targetRef,
          routeVariantRefs: [sharedRouteVariantRef],
          predicates: [{ kind: 'visible', targetRef }],
          provenance: ['tests/state-topology.spec.ts'],
        };
      }),
      eventSignatures: [{
        ref: eventRef,
        screen,
        targetRef: createCanonicalTargetRef('target:element:synthetic:field-0'),
        label: 'Synthetic noop event',
        aliases: [],
        dispatch: { action: 'custom' },
        requiredStateRefs: [],
        forbiddenStateRefs: [],
        effects: {
          transitionRefs: [transitionRef],
          resultStateRefs: [stateRefs[0]!],
          observableEffects: ['synthetic-visible'],
          assertions: ['first synthetic state remains visible'],
        },
        observationPlan: {
          timeoutMs: 500,
          settleMs: 0,
          observeStateRefs: [stateRefs[0]!],
        },
        provenance: ['tests/state-topology.spec.ts'],
      }],
      transitions: [{
        ref: transitionRef,
        screen,
        label: 'Synthetic visible transition',
        aliases: [],
        eventSignatureRef: eventRef,
        sourceStateRefs: [],
        targetStateRefs: [stateRefs[0]!],
        effectKind: 'reveal',
        observableEffects: ['synthetic-visible'],
        provenance: ['tests/state-topology.spec.ts'],
      }],
      observations: [],
    },
    screens: [{
      screen,
      routeVariantRefs: [sharedRouteVariantRef],
      elements: stateRefs.map((_, index) => ({
        element: createElementId(`field-${index}`),
        targetRef: createCanonicalTargetRef(`target:element:synthetic:field-${index}`),
        role: 'textbox',
        name: `Field ${index}`,
        locator: [{ kind: 'test-id', value: `field-${index}` }],
        widget: createWidgetId('os-input'),
        surface: createSurfaceId('synthetic-surface'),
      })),
    }],
  };
}

test.describe('real page state topology', () => {
  test.skip(!hasChromiumInstalled, `Chromium executable not installed at ${chromiumExecutablePath}`);

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
});

test('observeStateRefsOnPage is deterministic and bounded-concurrent on larger state sets', async () => {
  const stateCount = 12;
  const perCallDelayMs = 20;
  const context = createSyntheticObservationContext(stateCount);
  const page = createDelayedMockPage({
    delayMs: perCallDelayMs,
    valuesByTestId: Object.fromEntries(Array.from({ length: stateCount }, (_, index) => [`field-${index}`, `value-${index}`])),
  });

  const startedAt = Date.now();
  const firstRun = await observeStateRefsOnPage({
    page,
    context,
    stateRefs: context.stateGraph.stateRefs,
    activeRouteVariantRefs: ['route-variant:demo:synthetic:default'],
  });
  const durationMs = Date.now() - startedAt;
  const secondRun = await observeStateRefsOnPage({
    page,
    context,
    stateRefs: context.stateGraph.stateRefs,
    activeRouteVariantRefs: ['route-variant:demo:synthetic:default'],
  });

  expect(firstRun).toEqual(secondRun);
  expect(firstRun.map((entry) => entry.stateRef)).toEqual([...firstRun.map((entry) => entry.stateRef)].sort((left, right) => left.localeCompare(right)));

  const sequentialLowerBoundMs = stateCount * perCallDelayMs * 4;
  expect(durationMs).toBeLessThan(sequentialLowerBoundMs * 0.8);
});

test('observeTransitionOnPage emits deterministic detail envelopes after concurrent observations', async () => {
  const context = createSyntheticObservationContext(8);
  const page = createDelayedMockPage({
    delayMs: 10,
    valuesByTestId: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`field-${index}`, `value-${index}`])),
  });
  const event = context.stateGraph.eventSignatures[0]!;
  const expectedTransitionRefs = context.stateGraph.transitions.map((transition) => transition.ref);

  const first = await observeTransitionOnPage({
    page,
    context,
    screen: createScreenId('synthetic-screen'),
    eventSignatureRef: event.ref,
    expectedTransitionRefs,
    source: 'runtime',
    actor: 'runtime-execution',
    observationId: 'test:synthetic:transition:first',
  });
  const second = await observeTransitionOnPage({
    page,
    context,
    screen: createScreenId('synthetic-screen'),
    eventSignatureRef: event.ref,
    expectedTransitionRefs,
    source: 'runtime',
    actor: 'runtime-execution',
    observationId: 'test:synthetic:transition:second',
  });

  expect({ ...first, observationId: 'normalized' }).toEqual({ ...second, observationId: 'normalized' });
  expect(Object.keys(first.detail ?? {})).toEqual([...(Object.keys(first.detail ?? {}))].sort((left, right) => left.localeCompare(right)));
});
