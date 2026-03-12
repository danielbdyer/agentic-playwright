import { expect, test } from '@playwright/test';
import { writeFileSync } from 'fs';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import {
  controlResolutionForStep,
  resolveRunSelection,
  runtimeControlsForScenario,
} from '../lib/application/controls';
import { runWithLocalServices } from '../lib/composition/local-services';
import {
  createElementId,
  createScreenId,
  createSurfaceId,
  createWidgetId,
} from '../lib/domain/identity';
import type { StepTask } from '../lib/domain/types';
import { deterministicRuntimeStepAgent } from '../lib/runtime/agent';
import { createTestWorkspace } from './support/workspace';

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireRuntimeKnowledge(step: StepTask): NonNullable<StepTask['runtimeKnowledge']> {
  if (!step.runtimeKnowledge) {
    throw new Error('runtime knowledge is required for this test');
  }
  return step.runtimeKnowledge;
}

test('workspace catalog exposes canonical control surfaces for the seeded scenario', async () => {
  const workspace = createTestWorkspace('controls-catalog');
  try {
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);
    const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === '10001')?.artifact;
    expect(scenario).toBeTruthy();
    if (!scenario) {
      throw new Error('seeded scenario 10001 is required');
    }

    const controls = runtimeControlsForScenario(catalog, scenario);
    expect(controls.datasets.map((entry) => entry.name)).toEqual(['demo-default']);
    expect(controls.runbooks.map((entry) => entry.name)).toEqual(['demo-smoke']);
    expect(controls.runbooks[0]?.recoveryPolicy?.families['environment-runtime-failure']?.budget.maxAttempts).toBe(3);
    expect(controls.resolutionControls.map((entry) => entry.stepIndex)).toEqual([2, 3, 4]);

    const stepTwoResolution = controlResolutionForStep(controls, 2, 'demo-policy-search');
    expect(stepTwoResolution?.element).toBe(createElementId('policyNumberInput'));
  } finally {
    workspace.cleanup();
  }
});

test('run selection gives CLI ado id priority and otherwise uses runbook/tag selection', async () => {
  const workspace = createTestWorkspace('controls-run-selection');
  try {
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    expect(resolveRunSelection(catalog, {
      adoId: '10001',
      runbookName: null,
      tag: 'does-not-matter',
    })).toEqual({
      adoIds: ['10001'],
      runbook: expect.objectContaining({ name: 'demo-smoke' }),
    });

    expect(resolveRunSelection(catalog, {
      adoId: null,
      runbookName: 'demo-smoke',
      tag: 'smoke',
    })).toEqual({
      adoIds: ['10001'],
      runbook: expect.objectContaining({ name: 'demo-smoke' }),
    });
  } finally {
    workspace.cleanup();
  }
});

test('runtime agent reports the winning data source across explicit, control, dataset, and generated-token paths', async () => {
  const policySearchScreenId = createScreenId('policy-search');
  const policyNumberInputId = createElementId('policyNumberInput');
  const searchFormId = createSurfaceId('search-form');
  const osInputWidgetId = createWidgetId('os-input');

  const baseStep: StepTask = {
    index: 2,
    intent: 'Enter policy number on policy search',
    actionText: 'Enter policy number on policy search',
    expectedText: 'Policy number is accepted',
    normalizedIntent: 'enter policy number on policy search => policy number is accepted',
    allowedActions: ['input'],
    explicitResolution: null,
    controlResolution: null,
    runtimeKnowledge: {
      knowledgeFingerprint: 'sha256:knowledge',
      confidenceFingerprint: 'sha256:confidence',
      sharedPatterns: {
        version: 1 as const,
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
        screen: policySearchScreenId,
        url: '/policy-search',
        screenAliases: ['policy search'],
        knowledgeRefs: [
          'knowledge/surfaces/policy-search.surface.yaml',
          'knowledge/screens/policy-search.elements.yaml',
        ],
        supplementRefs: ['knowledge/screens/policy-search.hints.yaml'],
        elements: [{
          element: policyNumberInputId,
          role: 'textbox',
          name: 'Policy Number',
          surface: searchFormId,
          widget: osInputWidgetId,
          affordance: 'text-entry',
          aliases: ['policy number'],
          locator: [],
          postures: [],
          defaultValueRef: '{{activePolicy.number}}',
          parameter: 'policyNumber',
          snapshotAliases: {},
        }],
        sectionSnapshots: [],
      }],
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: {
        datasets: [{
          name: 'demo-default',
          artifactPath: 'controls/datasets/demo-default.dataset.yaml',
          isDefault: true,
          fixtures: { activePolicy: { number: 'POL-001' } },
          elementDefaults: {
            'policy-search.policyNumberInput': '{{activePolicy.number}}',
          },
          generatedTokens: {
            'policy-search.policyNumberInput': 'policy-search.policyNumberInput',
          },
        }],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  };

  {
    const explicitStep = cloneJson(baseStep);
    const explicitRuntimeKnowledge = requireRuntimeKnowledge(explicitStep);
    explicitStep.explicitResolution = {
      action: 'input',
      screen: explicitRuntimeKnowledge.screens[0]?.screen ?? null,
      element: explicitRuntimeKnowledge.screens[0]?.elements[0]?.element ?? null,
      posture: explicitRuntimeKnowledge.screens[0]?.elements[0]?.postures[0] ?? null,
      override: '{{scenarioOverride.value}}',
      snapshot_template: null,
    };
    const explicitReceipt = await deterministicRuntimeStepAgent.resolve(explicitStep, {
      provider: 'test-agent',
      mode: 'diagnostic',
      runAt: '2026-03-09T00:00:00.000Z',
    });
    expect(explicitReceipt.kind).toBe('resolved');
    if (explicitReceipt.kind !== 'resolved') {
      throw new Error('expected explicit receipt to resolve');
    }
    expect(explicitReceipt.target.override).toBe('{{scenarioOverride.value}}');
    expect(explicitReceipt.winningSource).toBe('scenario-explicit');
  }

  {
    const controlledStep = cloneJson(baseStep);
    const controlledRuntimeKnowledge = requireRuntimeKnowledge(controlledStep);
    controlledStep.explicitResolution = null;
    controlledStep.controlResolution = {
      action: 'input',
      screen: controlledRuntimeKnowledge.screens[0]?.screen ?? null,
      element: controlledRuntimeKnowledge.screens[0]?.elements[0]?.element ?? null,
      posture: null,
      override: '{{controlOverride.value}}',
      snapshot_template: null,
    };
    controlledRuntimeKnowledge.controls.runbooks = [];
    controlledRuntimeKnowledge.controls.resolutionControls = [];
    const controlledReceipt = await deterministicRuntimeStepAgent.resolve(controlledStep, {
      provider: 'test-agent',
      mode: 'diagnostic',
      runAt: '2026-03-09T00:00:00.000Z',
    });
    expect(controlledReceipt.kind).toBe('resolved');
    if (controlledReceipt.kind !== 'resolved') {
      throw new Error('expected controlled receipt to resolve');
    }
    expect(controlledReceipt.target.override).toBe('{{controlOverride.value}}');
    expect(controlledReceipt.winningSource).toBe('resolution-control');
  }

  {
    const datasetStep = cloneJson(baseStep);
    const datasetRuntimeKnowledge = requireRuntimeKnowledge(datasetStep);
    datasetStep.explicitResolution = null;
    datasetStep.controlResolution = null;
    datasetRuntimeKnowledge.controls.runbooks = [];
    datasetRuntimeKnowledge.controls.resolutionControls = [];
    const datasetReceipt = await deterministicRuntimeStepAgent.resolve(datasetStep, {
      provider: 'test-agent',
      mode: 'diagnostic',
      runAt: '2026-03-09T00:00:00.000Z',
    });
    expect(datasetReceipt.kind).toBe('resolved');
    if (datasetReceipt.kind !== 'resolved') {
      throw new Error('expected dataset receipt to resolve');
    }
    expect(datasetReceipt.target.override).toBe('{{activePolicy.number}}');
    expect(datasetReceipt.winningSource).toBe('default-dataset');
  }

  {
    const generatedTokenStep = cloneJson(baseStep);
    const generatedTokenRuntimeKnowledge = requireRuntimeKnowledge(generatedTokenStep);
    generatedTokenStep.explicitResolution = null;
    generatedTokenStep.controlResolution = null;
    generatedTokenRuntimeKnowledge.controls.runbooks = [];
    generatedTokenRuntimeKnowledge.controls.resolutionControls = [];
    generatedTokenRuntimeKnowledge.controls.datasets = [];
    generatedTokenRuntimeKnowledge.screens[0]!.elements[0] = {
      ...generatedTokenRuntimeKnowledge.screens[0]!.elements[0]!,
      defaultValueRef: null,
      postures: [],
    };
    const generatedTokenReceipt = await deterministicRuntimeStepAgent.resolve(generatedTokenStep, {
      provider: 'test-agent',
      mode: 'diagnostic',
      runAt: '2026-03-09T00:00:00.000Z',
    });
    expect(generatedTokenReceipt.kind).toBe('resolved');
    if (generatedTokenReceipt.kind !== 'resolved') {
      throw new Error('expected generated-token receipt to resolve');
    }
    expect(generatedTokenReceipt.target.override).toBe('<<generated:policy-search.policyNumberInput>>');
    expect(generatedTokenReceipt.winningSource).toBe('generated-token');
  }
});

test('runtime agent uses approved-equivalent overlays before translation and live DOM', async () => {
  const step = cloneJson({
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
        version: 1 as const,
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
        supplementRefs: [],
        elements: [{
          element: createElementId('policyNumberInput'),
          role: 'textbox',
          name: 'Policy Number',
          surface: createSurfaceId('search-form'),
          widget: createWidgetId('os-input'),
          affordance: 'text-entry',
          aliases: ['policy number'],
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
        lastSuccessAt: '2026-03-09T00:00:00.000Z',
        lastFailureAt: null,
        lineage: {
          runIds: ['seed-run'],
          evidenceIds: ['.tesseract/evidence/runs/10001/seed/step-2-0.json'],
          sourceArtifactPaths: ['.tesseract/runs/10001/seed/run.json'],
        },
      }],
      controls: {
        datasets: [],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  } satisfies StepTask);

  const receipt = await deterministicRuntimeStepAgent.resolve(step, {
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
  });

  expect(receipt.kind).toBe('resolved');
  if (receipt.kind !== 'resolved') {
    throw new Error('expected overlay receipt to resolve');
  }
  expect(receipt.winningSource).toBe('approved-equivalent');
  expect(receipt.resolutionMode).toBe('deterministic');
  expect(receipt.overlayRefs).toContain('overlay-policy-ref');
});

test('runtime agent falls through to structured translation before live DOM', async () => {
  const step = cloneJson({
    index: 2,
    intent: 'Enter reference number',
    actionText: 'Type the reference number',
    expectedText: 'Reference number is accepted',
    normalizedIntent: 'type the reference number => reference number is accepted',
    allowedActions: ['input'],
    explicitResolution: null,
    controlResolution: null,
    runtimeKnowledge: {
      knowledgeFingerprint: 'sha256:knowledge',
      confidenceFingerprint: 'sha256:confidence',
      sharedPatterns: {
        version: 1 as const,
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
        supplementRefs: [],
        elements: [{
          element: createElementId('policyNumberInput'),
          role: 'textbox',
          name: 'Reference Number',
          surface: createSurfaceId('search-form'),
          widget: createWidgetId('os-input'),
          affordance: 'text-entry',
          aliases: ['reference'],
          locator: [],
          postures: [],
          defaultValueRef: null,
          parameter: null,
          snapshotAliases: {},
        }],
        sectionSnapshots: [],
      }],
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: {
        datasets: [],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  } satisfies StepTask);

  const receipt = await deterministicRuntimeStepAgent.resolve(step, {
    provider: 'test-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    translate: async (request) => ({
      kind: 'translation-receipt',
      version: 1,
      mode: 'structured-translation',
      matched: true,
      selected: {
        kind: 'element',
        target: 'policy-search.policyNumberInput',
        screen: createScreenId('policy-search'),
        element: createElementId('policyNumberInput'),
        posture: null,
        snapshotTemplate: null,
        aliases: ['reference number'],
        score: 0.75,
        sourceRefs: request.overlayRefs,
      },
      candidates: [],
      rationale: 'Structured translation matched reference number to policy-search.policyNumberInput.',
    }),
  });

  expect(receipt.kind).toBe('resolved');
  if (receipt.kind !== 'resolved') {
    throw new Error('expected translation receipt to resolve');
  }
  expect(receipt.winningSource).toBe('structured-translation');
  expect(receipt.resolutionMode).toBe('translation');
  expect(receipt.translation?.matched).toBeTruthy();
});


test('runtime controls expose dom exploration policy from resolution controls', async () => {
  const workspace = createTestWorkspace('controls-dom-policy');
  try {
    writeFileSync(workspace.resolve('controls', 'resolution', 'demo-policy-search.resolution.yaml'), `kind: resolution-control
version: 1
name: demo-policy-search
selector:
  adoIds: ["10001"]
  suites: ["demo/policy-search"]
  tags: ["smoke"]
domExplorationPolicy:
  maxCandidates: 2
  maxProbes: 5
  forbiddenActions: ["navigate", "custom"]
steps:
  - stepIndex: 2
    resolution:
      action: input
      screen: policy-search
      element: policyNumberInput
`, 'utf8');

    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);
    const scenario = catalog.scenarios.find((entry) => entry.artifact.source.ado_id === '10001')?.artifact;
    expect(scenario).toBeTruthy();
    if (!scenario) {
      throw new Error('seeded scenario 10001 is required');
    }

    const controls = runtimeControlsForScenario(catalog, scenario);
    const stepTwo = controls.resolutionControls.find((entry) => entry.stepIndex === 2 && entry.name === 'demo-policy-search');
    expect(stepTwo?.domExplorationPolicy).toEqual({
      maxCandidates: 2,
      maxProbes: 5,
      forbiddenActions: ['navigate', 'custom'],
    });
  } finally {
    workspace.cleanup();
  }
});
