import { expect, test } from '@playwright/test';
import { createElementId, createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import type { StepTask } from '../lib/domain/types';
import { RESOLUTION_PRECEDENCE, runResolutionPipeline, type RuntimeStepAgentContext } from '../lib/runtime/agent';
import { resolveFromDom } from '../lib/runtime/agent/dom-fallback';


function mockPageFromRoleCounts(roleCounts: Record<string, number>) {
  return {
    getByRole: (role: string, options?: { name?: string }) => ({
      count: async () => roleCounts[`${role}:${options?.name ?? ''}`] ?? 0,
    }),
    getByTestId: () => ({ count: async () => 0 }),
    locator: () => ({ count: async () => 0 }),
  };
}

function baseStep(): StepTask {
  return {
    index: 2,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input'],
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
          click: { id: 'core.click', aliases: ['click'] },
          'assert-snapshot': { id: 'core.assert-snapshot', aliases: ['verify'] },
        },
        postures: {},
        documents: ['knowledge/patterns/core.patterns.yaml'],
        sources: {
          actions: {
            navigate: 'knowledge/patterns/core.patterns.yaml',
            input: 'knowledge/patterns/core.patterns.yaml',
            click: 'knowledge/patterns/core.patterns.yaml',
            'assert-snapshot': 'knowledge/patterns/core.patterns.yaml',
          },
          postures: {},
        },
      },
      screens: [{
        screen: createScreenId('policy-search'),
        url: '/policy-search',
        screenAliases: ['policy search'],
        knowledgeRefs: ['knowledge/surfaces/policy-search.surface.yaml', 'knowledge/screens/policy-search.elements.yaml'],
        supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
        elements: [{
          element: createElementId('policyNumberInput'),
          role: 'textbox',
          name: 'Policy Number',
          surface: createSurfaceId('search-form'),
          widget: createWidgetId('os-input'),
          affordance: 'text-entry',
          aliases: ['policy number', 'policy ref'],
          locator: [],
          postures: [],
          defaultValueRef: null,
          parameter: null,
          snapshotAliases: {},
        }],
        sectionSnapshots: [],
      }],
      evidenceRefs: ['.tesseract/evidence/runs/10001/seed/step-2-0.json'],
      confidenceOverlays: [{
        id: 'overlay-policy-ref',
        artifactType: 'hints',
        artifactPath: 'knowledge/screens/policy-search.hints.yaml',
        score: 0.95,
        threshold: 0.9,
        status: 'approved-equivalent',
        successCount: 4,
        failureCount: 0,
        evidenceCount: 1,
        screen: createScreenId('policy-search'),
        element: createElementId('policyNumberInput'),
        posture: null,
        snapshotTemplate: null,
        learnedAliases: ['policy ref'],
        sourceRunId: 'run-1',
        sourceStepIndex: 2,
      }],
      controls: {
        datasets: [],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  };
}

test('resolution pipeline precedence is explicit and stable', () => {
  expect(RESOLUTION_PRECEDENCE).toEqual([
    'explicit',
    'control',
    'approved-knowledge',
    'overlay',
    'translation',
    'live-dom',
    'needs-human',
  ]);
});

test('overlay resolution short-circuits translation and preserves receipt fields', async () => {
  let translateCalls = 0;
  const receipt = await runResolutionPipeline(baseStep(), {
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    translate: () => {
      translateCalls += 1;
      return {
        version: 1,
        matched: true,
        rationale: 'should not run',
        selected: null,
        candidates: [],
      };
    },
  });

  expect(receipt.kind).toBe('resolved');
  expect(receipt.winningSource).toBe('approved-equivalent');
  expect(receipt.overlayRefs).toContain('overlay-policy-ref');
  expect(receipt.translation).toBeNull();
  expect(translateCalls).toBe(0);
});

test('provider identity does not change receipt envelope shape or governance semantics', async () => {
  const left = await runResolutionPipeline(baseStep(), {
    provider: 'deterministic-runtime-step-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
  });
  const right = await runResolutionPipeline(baseStep(), {
    provider: 'vscode-runtime-step-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
  });

  const shape = (receipt: typeof left) => ({
    kind: receipt.kind,
    stage: receipt.stage,
    scope: receipt.scope,
    governance: receipt.governance,
    winningConcern: receipt.winningConcern,
    winningSource: receipt.winningSource,
    handshakes: receipt.handshakes,
  });

  expect(shape(left)).toEqual(shape(right));
});

test('live DOM ambiguity is bounded and deterministic for tie-breaking and shortlist evidence', async () => {
  const page = mockPageFromRoleCounts({ 'textbox:A': 1, 'textbox:B': 1 });
  const step = baseStep();
  step.controlResolution = { action: 'input', screen: createScreenId('policy-search') };
  step.runtimeKnowledge.confidenceOverlays = [];
  step.runtimeKnowledge.controls.resolutionControls = [{
    name: 'ci-policy',
    artifactPath: 'controls/resolution/ci-policy.resolution.yaml',
    stepIndex: 2,
    resolution: {},
    domExplorationPolicy: { maxCandidates: 2, maxProbes: 4, forbiddenActions: [] },
  }];
  step.runtimeKnowledge.screens[0].elements = [
    {
      element: createElementId('alphaInput'),
      role: 'textbox',
      name: 'A',
      surface: createSurfaceId('search-form'),
      widget: createWidgetId('os-input'),
      aliases: [],
      locator: [],
      postures: [],
      snapshotAliases: {},
    },
    {
      element: createElementId('betaInput'),
      role: 'textbox',
      name: 'B',
      surface: createSurfaceId('search-form'),
      widget: createWidgetId('os-input'),
      aliases: [],
      locator: [],
      postures: [],
      snapshotAliases: {},
    },
  ];

  const dom = await resolveFromDom(page as never, step, step.runtimeKnowledge.screens[0] ?? null, 'input', {
    maxCandidates: 2,
    maxProbes: 4,
    forbiddenActions: [],
  });
  expect(dom.topCandidate?.element.element).toBe(createElementId('alphaInput'));
  expect(dom.candidates.length).toBe(2);

  const receipt = await runResolutionPipeline(step, {
    page: page as never,
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    controlSelection: { resolutionControl: 'ci-policy' },
  });

  expect(receipt.kind).toBe('needs-human');
  expect(receipt.governance).toBe('review-required');
  expect(receipt.reason).toContain('No safe executable interpretation');
});

test('forbidden action policy yields review-required needs-human with shortlist evidence', async () => {
  const page = mockPageFromRoleCounts({ 'button:Submit': 1, 'button:Continue': 1 });
  const step = baseStep();
  step.allowedActions = ['click'];
  step.actionText = 'Click continue';
  step.normalizedIntent = 'click continue => advances';
  step.runtimeKnowledge.confidenceOverlays = [];
  step.runtimeKnowledge.controls.resolutionControls = [{
    name: 'interactive-policy',
    artifactPath: 'controls/resolution/interactive-policy.resolution.yaml',
    stepIndex: 2,
    resolution: {},
    domExplorationPolicy: { maxCandidates: 2, maxProbes: 1, forbiddenActions: ['click'] },
  }];
  step.runtimeKnowledge.screens[0].elements = [
    {
      element: createElementId('submitButton'),
      role: 'button',
      name: 'Submit',
      surface: createSurfaceId('search-form'),
      widget: createWidgetId('os-button'),
      aliases: [],
      locator: [],
      postures: [],
      snapshotAliases: {},
    },
  ];

  const receipt = await runResolutionPipeline(step, {
    page: page as never,
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    controlSelection: { resolutionControl: 'interactive-policy' },
  });

  expect(receipt.kind).toBe('needs-human');
  expect(receipt.governance).toBe('review-required');
  expect(receipt.reason).toContain('No safe executable interpretation');
});


test('working memory is updated across steps and receipt lineage captures memory priors', async () => {
  const first = baseStep();
  first.runtimeKnowledge.confidenceOverlays = [];
  first.controlResolution = { action: 'input', screen: createScreenId('policy-search'), element: createElementId('policyNumberInput') };
  const context: RuntimeStepAgentContext = {
    provider: 'test-agent',
    mode: 'diagnostic' as const,
    runAt: '2026-03-09T00:00:00.000Z',
  };

  const firstReceipt = await runResolutionPipeline(first, context);
  expect(firstReceipt.kind).toBe('resolved');
  expect(context.runtimeWorkingMemory?.currentScreen?.screen).toBe(createScreenId('policy-search'));
  expect(context.runtimeWorkingMemory?.activeEntityKeys).toContain(createElementId('policyNumberInput'));

  const second = baseStep();
  second.index = 9;
  second.runtimeKnowledge.confidenceOverlays = [];
  second.actionText = 'Navigate to policy search';
  second.normalizedIntent = 'navigate to policy search => on policy search';
  second.controlResolution = { action: 'navigate', screen: createScreenId('policy-search') };
  await runResolutionPipeline(second, context);

  expect(context.runtimeWorkingMemory?.openedPanels).toEqual([]);
  expect(context.runtimeWorkingMemory?.openedModals).toEqual([]);

  const third = baseStep();
  third.index = 10;
  third.runtimeKnowledge.confidenceOverlays = [];
  third.controlResolution = { action: 'input', screen: createScreenId('policy-search'), element: createElementId('policyNumberInput') };
  const thirdReceipt = await runResolutionPipeline(third, context);
  expect(thirdReceipt.lineage.sources.some((entry) => entry.startsWith('memory:step:'))).toBeTruthy();
});
