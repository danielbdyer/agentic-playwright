import { expect, test } from '@playwright/test';
import { createCanonicalTargetRef, createElementId, createScreenId } from '../../lib/domain/kernel/identity';
import { rankActionCandidates, rankElementCandidates, rankScreenCandidates } from '../../lib/runtime/resolution/candidate-lattice';
import { cloneJson, createInterfaceResolutionContext, createPolicySearchScreen, createGroundedStep } from '../support/interface-fixtures';

test('candidate lattice precedence keeps explicit above control above approved knowledge', () => {
  const resolutionContext = createInterfaceResolutionContext();
  const explicitTask = createGroundedStep({
    explicitResolution: { action: 'click', screen: createScreenId('policy-search') },
    controlResolution: { action: 'input' },
  }, resolutionContext);
  const explicitRank = rankActionCandidates(explicitTask, explicitTask.controlResolution, resolutionContext);
  expect(explicitRank.selected?.value).toBe('click');
  expect(explicitRank.selected?.source).toBe('explicit');

  const controlTask = createGroundedStep({
    explicitResolution: null,
    controlResolution: { action: 'click' },
  }, resolutionContext);
  const controlRank = rankActionCandidates(controlTask, controlTask.controlResolution, resolutionContext);
  expect(controlRank.selected?.value).toBe('click');
  expect(controlRank.selected?.source).toBe('control');
});

test('screen and element ranking remain deterministic across equivalent permutations', () => {
  const leftContext = createInterfaceResolutionContext({
    screens: [
      createPolicySearchScreen(),
      createPolicySearchScreen({ screen: createScreenId('alpha-screen'), screenAliases: ['policy search'] }),
    ],
  });
  const left = createGroundedStep({}, leftContext);
  const rightContext = cloneJson(leftContext);
  rightContext.screens = [...rightContext.screens].reverse().map((screen) => ({
    ...screen,
    screenAliases: [...screen.screenAliases].reverse(),
    elements: [...screen.elements].reverse().map((element) => ({
      ...element,
      aliases: [...element.aliases].reverse(),
    })),
  }));
  const right = createGroundedStep({}, rightContext);

  const leftScreen = rankScreenCandidates(left, 'input', left.controlResolution, null, leftContext);
  const rightScreen = rankScreenCandidates(right, 'input', right.controlResolution, null, rightContext);

  expect(leftScreen.selected?.value?.screen).toBe(rightScreen.selected?.value?.screen);
  expect(leftScreen.ranked.map((entry) => entry.value?.screen ?? null)).toEqual(rightScreen.ranked.map((entry) => entry.value?.screen ?? null));

  const leftElement = rankElementCandidates(left, leftScreen.selected?.value ?? null, left.controlResolution);
  const rightElement = rankElementCandidates(right, rightScreen.selected?.value ?? null, right.controlResolution);
  expect(leftElement.selected?.value?.element).toBe(rightElement.selected?.value?.element);
  expect(leftElement.ranked.map((entry) => entry.value?.element ?? null)).toEqual(rightElement.ranked.map((entry) => entry.value?.element ?? null));
});

test('working-memory priors boost same-screen continuation and known entity context', () => {
  const resolutionContext = createInterfaceResolutionContext({
    screens: [
      createPolicySearchScreen({
        screen: createScreenId('z-policy-search'),
        screenAliases: ['policy search'],
      }),
      createPolicySearchScreen({
        screen: createScreenId('a-policy-search'),
        screenAliases: ['policy search'],
        elements: [
          {
            ...createPolicySearchScreen().elements[0]!,
            element: createElementId('preferredPolicyRefInput'),
            targetRef: createCanonicalTargetRef('target:element:a-policy-search:preferredPolicyRefInput'),
            aliases: ['policy ref', 'policy reference preferred'],
          },
        ],
      }),
    ],
  });
  const task = createGroundedStep({
    actionText: 'Enter policy search preferred policy ref',
    normalizedIntent: 'enter policy search preferred policy ref => policy accepted',
  }, resolutionContext);

  const memory = {
    currentScreen: { screen: createScreenId('a-policy-search'), confidence: 1, observedAtStep: 1 },
    activeStateRefs: [],
    lastObservedTransitionRefs: [],
    activeRouteVariantRefs: [],
    activeTargetRefs: [createCanonicalTargetRef('target:element:a-policy-search:preferredPolicyRefInput')],
    lastSuccessfulLocatorRung: null,
    recentAssertions: [],
    causalLinks: [],
    lineage: [],
  };

  const screenRank = rankScreenCandidates(task, 'input', task.controlResolution, null, resolutionContext, memory);
  expect(screenRank.selected?.value?.screen).toBe(createScreenId('a-policy-search'));

  const elementRank = rankElementCandidates(task, screenRank.selected?.value ?? null, task.controlResolution, memory);
  expect(elementRank.selected?.value?.element).toBe(createElementId('preferredPolicyRefInput'));
  expect(elementRank.selected?.summary).toContain('Observed-state session preserved a prior target match');
});
