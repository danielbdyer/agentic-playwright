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
} from '../lib/domain/identity';
import type { TranslationRequest } from '../lib/domain/types';
import { deterministicRuntimeStepAgent } from '../lib/runtime/agent';
import { createTestWorkspace } from './support/workspace';
import {
  cloneJson,
  createAgentContext,
  createInterfaceResolutionContext,
  createGroundedStep,
} from './support/interface-fixtures';

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
    expect(controls.resolutionControls.map((entry) => entry.stepIndex)).toEqual([1, 2, 3, 4]);

    const stepOneResolution = controlResolutionForStep(controls, 1, 'demo-policy-search');
    expect(stepOneResolution?.action).toBe('navigate');
    expect(stepOneResolution?.screen).toBe(createScreenId('policy-search'));

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
  const resolutionContext = createInterfaceResolutionContext({
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
  });
  resolutionContext.screens[0]!.elements[0]!.defaultValueRef = '{{activePolicy.number}}';
  resolutionContext.screens[0]!.elements[0]!.parameter = 'policyNumber';
  const baseStep = createGroundedStep({
    index: 2,
    actionText: 'Enter policy number on policy search',
    expectedText: 'Policy number is accepted',
    normalizedIntent: 'enter policy number on policy search => policy number is accepted',
    allowedActions: ['input'],
  }, resolutionContext);

  {
    const step = cloneJson(baseStep);
    step.explicitResolution = {
      action: 'input',
      screen: createScreenId('policy-search'),
      element: createElementId('policyNumberInput'),
      posture: null,
      override: '{{scenarioOverride.value}}',
      snapshot_template: null,
    };
    const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(resolutionContext));
    expect(receipt.kind).toBe('resolved');
    if (receipt.kind !== 'resolved') {
      throw new Error('expected explicit receipt to resolve');
    }
    expect(receipt.target.override).toBe('{{scenarioOverride.value}}');
    expect(receipt.winningSource).toBe('scenario-explicit');
  }

  {
    const step = cloneJson(baseStep);
    step.controlResolution = {
      action: 'input',
      screen: createScreenId('policy-search'),
      element: createElementId('policyNumberInput'),
      posture: null,
      override: '{{controlOverride.value}}',
      snapshot_template: null,
    };
    const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(resolutionContext));
    expect(receipt.kind).toBe('resolved');
    if (receipt.kind !== 'resolved') {
      throw new Error('expected controlled receipt to resolve');
    }
    expect(receipt.target.override).toBe('{{controlOverride.value}}');
    expect(receipt.winningSource).toBe('resolution-control');
  }

  {
    const step = cloneJson(baseStep);
    const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(resolutionContext));
    expect(receipt.kind).toBe('resolved');
    if (receipt.kind !== 'resolved') {
      throw new Error('expected dataset receipt to resolve');
    }
    expect(receipt.target.override).toBe('{{activePolicy.number}}');
    expect(receipt.winningSource).toBe('default-dataset');
  }

  {
    const step = cloneJson(baseStep);
    const generatedContext = cloneJson(resolutionContext);
    generatedContext.controls.datasets = [];
    generatedContext.screens[0]!.elements[0]!.defaultValueRef = null;
    const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(generatedContext));
    expect(receipt.kind).toBe('resolved');
    if (receipt.kind !== 'resolved') {
      throw new Error('expected generated-token receipt to resolve');
    }
    expect(receipt.target.override).toBe('<<generated:policy-search.policyNumberInput>>');
    expect(receipt.winningSource).toBe('generated-token');
  }
});

test('runtime agent uses approved-equivalent overlays before translation and live DOM', async () => {
  const resolutionContext = createInterfaceResolutionContext({
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
  });
  const step = createGroundedStep({
    index: 2,
    allowedActions: ['input'],
  }, resolutionContext);

  const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(resolutionContext));

  expect(receipt.kind).toBe('resolved');
  if (receipt.kind !== 'resolved') {
    throw new Error('expected overlay receipt to resolve');
  }
  expect(receipt.winningSource).toBe('approved-equivalent');
  expect(receipt.resolutionMode).toBe('deterministic');
  expect(receipt.overlayRefs).toContain('overlay-policy-ref');
});

test('runtime agent falls through to structured translation before live DOM', async () => {
  const resolutionContext = createInterfaceResolutionContext();
  resolutionContext.confidenceOverlays = [];
  resolutionContext.screens[0]!.elements[0]!.name = 'Reference Number';
  resolutionContext.screens[0]!.elements[0]!.aliases = ['reference'];
  const step = createGroundedStep({
    index: 2,
    intent: 'Enter reference number',
    actionText: 'Type the reference number',
    expectedText: 'Reference number is accepted',
    normalizedIntent: 'type the reference number => reference number is accepted',
    allowedActions: ['input'],
  }, resolutionContext);

  const receipt = await deterministicRuntimeStepAgent.resolve(step, createAgentContext(resolutionContext, {
    translate: async (request: TranslationRequest) => ({
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
  }));

  // Translation may produce 'resolved' or 'resolved-with-proposals' when
  // WP4 interpretation proposals are generated alongside the translation receipt
  expect(['resolved', 'resolved-with-proposals']).toContain(receipt.kind);
  if (receipt.kind !== 'resolved' && receipt.kind !== 'resolved-with-proposals') {
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
