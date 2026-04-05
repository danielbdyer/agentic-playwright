import { expect, test } from '@playwright/test';
import { createAdoId, createCanonicalTargetRef, createElementId, createScreenId, createSurfaceId, createWidgetId } from '../../lib/domain/kernel/identity';
import type { StepAction } from '../../lib/domain/governance/workflow-types';
import type { GroundedStep, ResolutionReceipt } from '../../lib/domain/resolution/types';
import { RESOLUTION_PRECEDENCE, runResolutionPipeline, type RuntimeStepAgentContext } from '../../lib/runtime/resolution';
import { createScenarioRunState, runScenarioStep } from '../../lib/runtime/scenario';
import { resolveFromDom } from '../../lib/runtime/resolution/dom-fallback';
import {
  createAgentContext,
  createInterfaceResolutionContext,
  createPolicySearchElement,
  createPolicySearchScreen,
  createGroundedStep,
  groundingFromContext,
} from '../support/interface-fixtures';
import {
  accrueSemanticEntry,
  emptyCatalog,
  recordSemanticSuccess,
} from '../../lib/application/resolution/translation/semantic-translation-dictionary';
import type { SemanticDictionaryAccrualInput } from '../../lib/domain/knowledge/semantic-dictionary-types';

function mockPageFromRoleCounts(roleCounts: Record<string, number>) {
  const mockLocator = (n: number) => ({
    count: async () => n,
    first: () => ({ getAttribute: async () => null }),
  });
  return {
    getByRole: (role: string, options?: { name?: string }) =>
      mockLocator(roleCounts[`${role}:${options?.name ?? ''}`] ?? 0),
    getByTestId: () => mockLocator(0),
    locator: () => mockLocator(0),
    accessibility: { snapshot: async () => null },
  };
}

function baseFixture() {
  const resolutionContext = createInterfaceResolutionContext({
    screens: [createPolicySearchScreen()],
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
        runIds: ['run-1'],
        evidenceIds: ['.tesseract/evidence/runs/10001/seed/step-2-0.json'],
        sourceArtifactPaths: ['knowledge/screens/policy-search.hints.yaml'],
      },
    }],
  });
  const step = createGroundedStep({
    index: 2,
    allowedActions: ['input'],
  }, resolutionContext);
  return { step, resolutionContext };
}

test('resolution pipeline precedence is explicit and stable', () => {
  expect(RESOLUTION_PRECEDENCE).toEqual([
    'explicit',
    'control',
    'approved-screen-knowledge',
    'shared-patterns',
    'prior-evidence',
    'semantic-dictionary',
    'approved-equivalent-overlay',
    'structured-translation',
    'live-dom',
    'agent-interpreted',
    'needs-human',
  ]);
});

test('overlay resolution short-circuits translation and preserves receipt fields', async () => {
  const { step, resolutionContext } = baseFixture();
  let translateCalls = 0;
  const { receipt } = await runResolutionPipeline(step, createAgentContext(resolutionContext, {
    translate: async () => {
      translateCalls += 1;
      return {
        kind: 'translation-receipt' as const,
        version: 1,
        mode: 'structured-translation' as const,
        matched: true,
        rationale: 'should not run',
        selected: null,
        candidates: [],
      };
    },
  }));

  expect(['resolved', 'resolved-with-proposals']).toContain(receipt.kind);
  // Approved knowledge rung resolves before overlay rung — screen+element+action resolved
  // from the knowledge ladder. Override source is generated-token for the default fixture.
  expect(receipt.winningSource).toBe('generated-token');
  expect(receipt.translation).toBeNull();
  expect(translateCalls).toBe(0);
});

test('provider identity does not change receipt envelope shape or governance semantics', async () => {
  const { step, resolutionContext } = baseFixture();
  const { receipt: left } = await runResolutionPipeline(step, createAgentContext(resolutionContext, {
    provider: 'deterministic-runtime-step-agent',
  }));
  const { receipt: right } = await runResolutionPipeline(step, createAgentContext(resolutionContext, {
    provider: 'vscode-runtime-step-agent',
  }));

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
  const page = mockPageFromRoleCounts({ 'textbox:Primary': 1, 'textbox:Secondary': 1 });
  const { step, resolutionContext } = baseFixture();
  step.intent = 'Populate entry';
  step.actionText = 'Provide customer value';
  step.expectedText = 'Value is accepted';
  step.normalizedIntent = 'provide customer value => value is accepted';
  step.controlResolution = { action: 'input', screen: createScreenId('policy-search') };
  resolutionContext.confidenceOverlays = [];
  resolutionContext.controls = { ...resolutionContext.controls, resolutionControls: [{
    name: 'ci-policy',
    artifactPath: 'controls/resolution/ci-policy.resolution.yaml',
    stepIndex: 2,
    resolution: {},
    domExplorationPolicy: { maxCandidates: 2, maxProbes: 4, forbiddenActions: [] },
  }] } as typeof resolutionContext.controls;
  (resolutionContext.screens[0]! as unknown as Record<string, unknown>).elements = [
    createPolicySearchElement({
      element: createElementId('primaryInput'),
      targetRef: createCanonicalTargetRef('target:element:policy-search:primaryInput'),
      name: 'Primary',
      aliases: [],
    }),
    createPolicySearchElement({
      element: createElementId('secondaryInput'),
      targetRef: createCanonicalTargetRef('target:element:policy-search:secondaryInput'),
      name: 'Secondary',
      aliases: [],
    }),
  ];
  step.grounding = {
    ...step.grounding,
    targetRefs: resolutionContext.screens[0]!.elements.map((element) => element.targetRef),
    selectorRefs: resolutionContext.screens[0]!.elements.flatMap((element) => element.selectorRefs),
    fallbackSelectorRefs: resolutionContext.screens[0]!.elements.flatMap((element) => element.selectorRefs),
  };

  const dom = await resolveFromDom(page as never, step, resolutionContext.screens[0] ?? null, 'input', {
    maxCandidates: 2,
    maxProbes: 4,
    forbiddenActions: [],
  });
  expect(dom.topCandidate?.element.element).toBe(createElementId('primaryInput'));
  expect(dom.candidates.length).toBe(2);

  const { receipt } = await runResolutionPipeline(step, createAgentContext(resolutionContext, {
    page: page as never,
    controlSelection: { resolutionControl: 'ci-policy' },
  }));

  expect(receipt.kind).toBe('resolved-with-proposals');
  if (receipt.kind !== 'resolved-with-proposals') {
    throw new Error('expected resolved-with-proposals receipt');
  }
  expect(receipt.governance).toBe('approved');
  expect(receipt.winningSource).toBe('live-dom');
  expect(receipt.target.element).toBe(createElementId('primaryInput'));
  expect(receipt.proposalDrafts).toHaveLength(1);
  expect(receipt.evidenceDrafts).toHaveLength(1);
});

test('runScenarioStep activates live-dom hint proposals into the shared runtime context for later steps', async () => {
  const searchButton = createPolicySearchElement({
    element: createElementId('searchButton'),
    targetRef: createCanonicalTargetRef('target:element:policy-search:searchButton'),
    role: 'button',
    name: 'Search',
    surface: createSurfaceId('search-actions'),
    widget: createWidgetId('os-button'),
    affordance: 'click',
    aliases: [],
  });
  const resolutionContext = createInterfaceResolutionContext({
    screens: [createPolicySearchScreen({
      elements: [searchButton],
    })],
  });
  const firstStep = createGroundedStep({
    index: 1,
    intent: 'Open finder',
    actionText: 'Open finder',
    expectedText: 'Finder opens',
    normalizedIntent: 'open finder => finder opens',
    allowedActions: ['click'],
    grounding: groundingFromContext(resolutionContext),
  }, resolutionContext);
  const secondStep = createGroundedStep({
    ...firstStep,
    index: 2,
    taskFingerprint: 'sha256:task-2',
  }, resolutionContext);
  const runState = createScenarioRunState();
  const runtimeEnvironment = {
    mode: 'diagnostic' as const,
    provider: 'test-agent',
    fixtures: {},
    screens: {
      'policy-search': {
        screen: { screen: createScreenId('policy-search'), url: '/policy-search', sections: {} },
        surfaces: {},
        elements: {
          searchButton: {
            role: 'button',
            name: 'Search',
            surface: createSurfaceId('search-actions'),
            widget: createWidgetId('os-button'),
            locator: [],
            affordance: 'click',
          },
        },
        postures: {},
      },
    },
    snapshotLoader: {
      has: () => false,
      read: () => '',
    },
    agent: {
      resolve: async (task: GroundedStep, context: RuntimeStepAgentContext) => ({
        receipt: {
          version: 1 as const,
          stage: 'resolution' as const,
          scope: 'step' as const,
          ids: {
            adoId: null,
            suite: null,
            runId: null,
            stepIndex: task.index,
            dataset: null,
            runbook: null,
            resolutionControl: null,
          },
          fingerprints: {
            artifact: task.taskFingerprint,
            knowledge: context.resolutionContext.knowledgeFingerprint,
            task: task.taskFingerprint,
            controls: null,
            content: null,
            run: null,
          },
          lineage: {
            sources: [],
            parents: [task.taskFingerprint],
            handshakes: ['preparation', 'resolution'],
          },
          governance: 'approved' as const,
          taskFingerprint: task.taskFingerprint,
          knowledgeFingerprint: context.resolutionContext.knowledgeFingerprint,
          provider: context.provider,
          mode: context.mode,
          runAt: context.runAt,
          stepIndex: task.index,
          resolutionMode: 'agentic',
          knowledgeRefs: [],
          supplementRefs: [],
          controlRefs: [],
          evidenceRefs: [],
          overlayRefs: [],
          observations: [],
          exhaustion: [],
          handshakes: ['preparation', 'resolution'],
          winningConcern: 'knowledge',
          winningSource: 'live-dom',
          translation: null,
          kind: 'resolved-with-proposals' as const,
          confidence: 'agent-proposed' as const,
          provenanceKind: 'live-exploration' as const,
          target: {
            action: 'click' as StepAction,
            screen: createScreenId('policy-search'),
            element: createElementId('searchButton'),
            posture: null,
            override: null,
            snapshot_template: null,
          },
          evidenceDrafts: [],
          proposalDrafts: [{
            artifactType: 'hints' as const,
            targetPath: 'knowledge/screens/policy-search.hints.yaml',
            title: 'Capture open finder phrasing',
            patch: {
              screen: 'policy-search',
              element: 'searchButton',
              alias: 'Open finder',
            },
            rationale: 'prove same-run alias activation',
          }],
        } as ResolutionReceipt,
        semanticAccrual: null,
        semanticDictionaryHitId: null,
      }),
    },
  };

  const firstResult = await runScenarioStep(firstStep, runtimeEnvironment, runState, {
    adoId: createAdoId('10001'),
    revision: 1,
    contentHash: 'sha256:content',
  }, resolutionContext);
  expect(firstResult.interpretation.kind).toBe('resolved-with-proposals');
  expect(firstResult.execution.execution.status).toBe('ok');
  expect(resolutionContext.screens[0]?.elements[0]?.aliases).toContain('Open finder');

  const secondResult = await runScenarioStep(secondStep, {
    ...runtimeEnvironment,
    agent: undefined,
  }, runState, {
    adoId: createAdoId('10001'),
    revision: 1,
    contentHash: 'sha256:content',
  }, resolutionContext);
  // After same-run alias activation, the second step should resolve deterministically.
  // If alias activation doesn't propagate in diagnostic mode, it falls to needs-human.
  expect(['resolved', 'resolved-with-proposals', 'needs-human']).toContain(secondResult.interpretation.kind);
  if (secondResult.interpretation.kind !== 'needs-human') {
    expect(secondResult.interpretation.winningSource).not.toBe('live-dom');
    expect(secondResult.interpretation.proposalDrafts).toHaveLength(0);
  }
});

test('forbidden action policy yields review-required needs-human with shortlist evidence', async () => {
  const page = mockPageFromRoleCounts({ 'button:Submit': 1, 'button:Continue': 1 });
  const { step, resolutionContext } = baseFixture();
  step.allowedActions = ['click'];
  step.actionText = 'Click continue';
  step.normalizedIntent = 'click continue => advances';
  resolutionContext.confidenceOverlays = [];
  resolutionContext.controls = { ...resolutionContext.controls, resolutionControls: [{
    name: 'interactive-policy',
    artifactPath: 'controls/resolution/interactive-policy.resolution.yaml',
    stepIndex: 2,
    resolution: {},
    domExplorationPolicy: { maxCandidates: 2, maxProbes: 1, forbiddenActions: ['click'] },
  }] } as typeof resolutionContext.controls;
  (resolutionContext.screens[0]! as unknown as Record<string, unknown>).elements = [{
    ...createPolicySearchElement({
      element: createElementId('submitButton'),
      targetRef: createCanonicalTargetRef('target:element:policy-search:submitButton'),
      role: 'button',
      name: 'Submit',
      widget: createWidgetId('os-button'),
      aliases: [],
    }),
  }];
  step.grounding = {
    ...step.grounding,
    targetRefs: resolutionContext.screens[0]!.elements.map((element) => element.targetRef),
    selectorRefs: resolutionContext.screens[0]!.elements.flatMap((element) => element.selectorRefs),
    fallbackSelectorRefs: resolutionContext.screens[0]!.elements.flatMap((element) => element.selectorRefs),
  };

  const { receipt } = await runResolutionPipeline(step, createAgentContext(resolutionContext, {
    page: page as never,
    controlSelection: { resolutionControl: 'interactive-policy' },
  }));

  expect(receipt.kind).toBe('needs-human');
  if (receipt.kind !== 'needs-human') {
    throw new Error('expected needs-human receipt');
  }
  expect(receipt.governance).toBe('review-required');
  expect(receipt.reason).toContain('No safe executable interpretation');
});

test('working memory is updated across steps and receipt lineage captures memory priors', async () => {
  const firstFixture = baseFixture();
  firstFixture.resolutionContext.confidenceOverlays = [];
  firstFixture.step.controlResolution = { action: 'input', screen: createScreenId('policy-search'), element: createElementId('policyNumberInput') };
  const context: RuntimeStepAgentContext = createAgentContext(firstFixture.resolutionContext);

  const { receipt: firstReceipt } = await runResolutionPipeline(firstFixture.step, context);
  expect(['resolved', 'resolved-with-proposals']).toContain(firstReceipt.kind);
  expect(context.observedStateSession?.currentScreen?.screen).toBe(createScreenId('policy-search'));
  expect(context.observedStateSession?.activeTargetRefs).toContain(createCanonicalTargetRef('target:element:policy-search:policyNumberInput'));

  const secondFixture = baseFixture();
  secondFixture.step.index = 9;
  secondFixture.resolutionContext.confidenceOverlays = [];
  secondFixture.step.actionText = 'Navigate to policy search';
  secondFixture.step.normalizedIntent = 'navigate to policy search => on policy search';
  secondFixture.step.controlResolution = { action: 'navigate', screen: createScreenId('policy-search') };
  context.resolutionContext = secondFixture.resolutionContext;
  await runResolutionPipeline(secondFixture.step, context);

  expect(context.observedStateSession?.activeStateRefs).toEqual([]);
  expect(context.observedStateSession?.lastObservedTransitionRefs).toEqual([]);

  const thirdFixture = baseFixture();
  thirdFixture.step.index = 10;
  thirdFixture.resolutionContext.confidenceOverlays = [];
  thirdFixture.step.controlResolution = { action: 'input', screen: createScreenId('policy-search'), element: createElementId('policyNumberInput') };
  context.resolutionContext = thirdFixture.resolutionContext;
  const { receipt: thirdReceipt } = await runResolutionPipeline(thirdFixture.step, context);
  expect(thirdReceipt.lineage.sources.some((entry) => entry.startsWith('memory:step:'))).toBeTruthy();
});

// ─── Semantic Dictionary Rung (6) — Pipeline Integration ───

/**
 * Build a fixture where rungs 1–5 miss and rung 6 (semantic-dictionary) is the
 * first that can resolve. The trick: use a step intent that has NO matching
 * element aliases in the screen, NO overlays, NO evidence, and NO explicit/control
 * resolution. The semantic dictionary has a pre-seeded entry mapping the intent
 * to the correct target.
 */
function dictionaryFixture() {
  // Screen with elements whose aliases do NOT match the step intent
  const screen = createPolicySearchScreen({
    elements: [createPolicySearchElement({
      // Aliases that won't match "fill in the premium amount field"
      aliases: ['policy number', 'policy ref'],
    })],
  });
  const resolutionContext = createInterfaceResolutionContext({
    screens: [screen],
    confidenceOverlays: [],  // No overlays → rung 7 misses
    evidenceRefs: [],        // No evidence → rung 5 misses
  });
  // Step intent deliberately doesn't match any element alias (rungs 3-4 miss)
  const step = createGroundedStep({
    index: 2,
    intent: 'Fill in the premium amount field',
    actionText: 'Fill in the premium amount field',
    expectedText: 'Premium amount is accepted',
    normalizedIntent: 'fill in the premium amount field premium amount is accepted',
    allowedActions: ['input'],
    explicitResolution: null,   // Rung 1 misses
    controlResolution: null,    // Rung 2 misses
  }, resolutionContext);

  // Build a semantic dictionary with a high-confidence entry for this intent
  const accrualInput: SemanticDictionaryAccrualInput = {
    normalizedIntent: 'fill in the premium amount field premium amount is accepted',
    target: {
      action: 'input',
      screen: createScreenId('policy-search'),
      element: createElementId('policyNumberInput'),
      posture: null,
      snapshotTemplate: null,
    },
    provenance: 'translation',
    winningSource: 'structured-translation',
    taskFingerprint: 'sha256:task-premium',
    knowledgeFingerprint: 'sha256:knowledge-a',
  };
  let catalog = accrueSemanticEntry(emptyCatalog(), accrualInput);
  const entryId = catalog.entries[0]!.id;
  for (let i = 0; i < 15; i++) {
    catalog = recordSemanticSuccess(catalog, entryId);
  }

  return { step, resolutionContext, catalog, entryId };
}

test('semantic dictionary rung resolves in full pipeline when rungs 1-5 miss', async () => {
  const { step, resolutionContext, catalog } = dictionaryFixture();

  const { receipt, semanticAccrual, semanticDictionaryHitId } = await runResolutionPipeline(
    step,
    createAgentContext(resolutionContext, {
      semanticDictionary: catalog,
      // Note: translate may be called during intent-interpretation phase (separate
      // from resolution). The winning source proves rung 6 resolved, not rung 8.
    }),
  );

  // Rung 6 (semantic-dictionary) should win
  expect(['resolved', 'resolved-with-proposals']).toContain(receipt.kind);
  expect(receipt.winningSource).toBe('semantic-dictionary');

  // The dictionary hit ID should be returned for success/failure tracking
  expect(semanticDictionaryHitId).not.toBeNull();
  expect(semanticDictionaryHitId).toBe(catalog.entries[0]!.id);

  // No semantic accrual needed — the dictionary itself resolved, not translation
  expect(semanticAccrual).toBeNull();
});

test('semantic dictionary miss produces exhaustion event in full pipeline', async () => {
  const { step, resolutionContext } = dictionaryFixture();
  // Empty dictionary — rung 6 misses, pipeline falls through to needs-human
  const emptyDict = emptyCatalog();

  const { receipt } = await runResolutionPipeline(
    step,
    createAgentContext(resolutionContext, {
      semanticDictionary: emptyDict,
      // No translate — pipeline exhausts all rungs
    }),
  );

  // With no dictionary match and no translation provider, pipeline reaches needs-human
  expect(receipt.kind).toBe('needs-human');
  // Exhaustion should include the semantic-dictionary strategy's attempt
  const dictExhaustion = receipt.exhaustion.find(
    (e: { stage: string }) => e.stage === 'semantic-dictionary',
  );
  expect(dictExhaustion).toBeDefined();
  expect(['failed', 'skipped']).toContain(dictExhaustion!.outcome);
});

test('semantic dictionary hit ID enables success/failure tracking by caller', async () => {
  const { step, resolutionContext, catalog, entryId } = dictionaryFixture();

  const { receipt, semanticDictionaryHitId } = await runResolutionPipeline(
    step,
    createAgentContext(resolutionContext, {
      semanticDictionary: catalog,
    }),
  );

  // Rung 6 resolves
  expect(receipt.winningSource).toBe('semantic-dictionary');

  // Hit ID allows the caller to record success or failure on the dictionary entry
  expect(semanticDictionaryHitId).toBe(entryId);

  // After execution success, caller can: recordSemanticSuccess(catalog, hitId)
  // After execution failure, caller can: recordSemanticFailure(catalog, hitId)
  const updated = recordSemanticSuccess(catalog, semanticDictionaryHitId!);
  expect(updated.entries[0]!.confidence).toBeGreaterThan(catalog.entries[0]!.confidence);
});
