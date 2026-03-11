import { expect, test } from '@playwright/test';
import { createElementId, createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import type { StepTask } from '../lib/domain/types';
import { rankActionCandidates, rankElementCandidates, rankScreenCandidates } from '../lib/runtime/agent/candidate-lattice';

function buildTask(overrides: Partial<StepTask> = {}): StepTask {
  const policyScreen = {
    screen: createScreenId('policy-search'),
    url: '/policy-search',
    screenAliases: ['policy search', 'policy lookup'],
    knowledgeRefs: ['knowledge/surfaces/policy-search.surface.yaml'],
    supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
    elements: [
      {
        element: createElementId('policyNumberInput'),
        role: 'textbox',
        name: 'Policy Number',
        surface: createSurfaceId('search-form'),
        widget: createWidgetId('os-input'),
        affordance: 'text-entry',
        aliases: ['policy ref', 'policy number'],
        locator: [],
        postures: [],
        defaultValueRef: null,
        parameter: null,
        snapshotAliases: {},
      },
    ],
    sectionSnapshots: [],
  };

  return {
    index: 1,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input', 'click'],
    explicitResolution: null,
    controlResolution: null,
    runtimeKnowledge: {
      knowledgeFingerprint: 'sha256:knowledge',
      confidenceFingerprint: 'sha256:confidence',
      sharedPatterns: {
        version: 1,
        actions: {
          navigate: { id: 'core.navigate', aliases: ['navigate'] },
          input: { id: 'core.input', aliases: ['enter', 'input', 'type'] },
          click: { id: 'core.click', aliases: ['click', 'select'] },
          'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
        },
        postures: {},
        documents: ['knowledge/patterns/core.patterns.yaml'],
        sources: { actions: { navigate: 'knowledge/patterns/core.patterns.yaml', input: 'knowledge/patterns/core.patterns.yaml', click: 'knowledge/patterns/core.patterns.yaml', 'assert-snapshot': 'knowledge/patterns/core.patterns.yaml' }, postures: {} },
      },
      screens: [policyScreen, { ...policyScreen, screen: createScreenId('alpha-screen'), screenAliases: ['policy search'] }],
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: { datasets: [], resolutionControls: [], runbooks: [] },
    },
    taskFingerprint: 'sha256:task',
    ...overrides,
  };
}

test('candidate lattice precedence keeps explicit above control above approved knowledge', () => {
  const explicitTask = buildTask({
    explicitResolution: { action: 'click', screen: createScreenId('policy-search') },
    controlResolution: { action: 'input' },
  });
  const explicitRank = rankActionCandidates(explicitTask, explicitTask.controlResolution);
  expect(explicitRank.selected?.value).toBe('click');
  expect(explicitRank.selected?.source).toBe('explicit');

  const controlTask = buildTask({
    explicitResolution: null,
    controlResolution: { action: 'click' },
  });
  const controlRank = rankActionCandidates(controlTask, controlTask.controlResolution);
  expect(controlRank.selected?.value).toBe('click');
  expect(controlRank.selected?.source).toBe('control');
});

test('screen and element ranking remain deterministic across equivalent permutations', () => {
  const left = buildTask();
  const right = buildTask({
    runtimeKnowledge: {
      ...buildTask().runtimeKnowledge,
      screens: [...buildTask().runtimeKnowledge.screens].reverse().map((screen) => ({
        ...screen,
        screenAliases: [...screen.screenAliases].reverse(),
        elements: [...screen.elements].reverse().map((element) => ({
          ...element,
          aliases: [...element.aliases].reverse(),
        })),
      })),
    },
  });

  const leftScreen = rankScreenCandidates(left, 'input', left.controlResolution, null);
  const rightScreen = rankScreenCandidates(right, 'input', right.controlResolution, null);

  expect(leftScreen.selected?.value?.screen).toBe(rightScreen.selected?.value?.screen);
  expect(leftScreen.ranked.map((entry) => entry.value?.screen ?? null)).toEqual(rightScreen.ranked.map((entry) => entry.value?.screen ?? null));

  const leftElement = rankElementCandidates(left, leftScreen.selected?.value ?? null, left.controlResolution);
  const rightElement = rankElementCandidates(right, rightScreen.selected?.value ?? null, right.controlResolution);
  expect(leftElement.selected?.value?.element).toBe(rightElement.selected?.value?.element);
  expect(leftElement.ranked.map((entry) => entry.value?.element ?? null)).toEqual(rightElement.ranked.map((entry) => entry.value?.element ?? null));
});


test('working-memory priors boost same-screen continuation and known entity context', () => {
  const task = buildTask({
    actionText: 'Enter policy search preferred policy ref',
    normalizedIntent: 'enter policy search preferred policy ref => policy accepted',
    runtimeKnowledge: {
      ...buildTask().runtimeKnowledge,
      screens: [
        {
          ...buildTask().runtimeKnowledge.screens[0],
          screen: createScreenId('z-policy-search'),
          screenAliases: ['policy search'],
        },
        {
          ...buildTask().runtimeKnowledge.screens[1],
          screen: createScreenId('a-policy-search'),
          screenAliases: ['policy search'],
          elements: [
            {
              ...buildTask().runtimeKnowledge.screens[1].elements[0],
              element: createElementId('preferredPolicyRefInput'),
              aliases: ['policy ref', 'policy reference preferred'],
            },
          ],
        },
      ],
    },
  });

  const memory = {
    currentScreen: { screen: createScreenId('a-policy-search'), confidence: 1, observedAtStep: 1 },
    activeEntityKeys: ['preferred'],
    openedPanels: [],
    openedModals: [],
    lastSuccessfulLocatorRung: null,
    recentAssertions: [],
    lineage: [],
  };

  const screenRank = rankScreenCandidates(task, 'input', task.controlResolution, null, memory);
  expect(screenRank.selected?.value?.screen).toBe(createScreenId('a-policy-search'));

  const elementRank = rankElementCandidates(task, screenRank.selected?.value ?? null, task.controlResolution, memory);
  expect(elementRank.selected?.value?.element).toBe(createElementId('preferredPolicyRefInput'));
  expect(elementRank.selected?.summary).toContain('Working-memory entity prior');
});

