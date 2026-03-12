import { expect, test } from '@playwright/test';
import { createRuntimeProviderRegistry, resolveRuntimeProvider, type RuntimeProvider } from '../lib/application/runtime-provider';
import { validateStepResults } from '../lib/application/execution/validate-step-results';
import { createElementId, createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import { runResolutionPipeline } from '../lib/runtime/agent';
import type { RuntimeStepAgentContext } from '../lib/runtime/agent/types';
import type { StepExecutionReceipt, StepTask } from '../lib/domain/types';

function baseStep(explicit = false): StepTask {
  return {
    index: 1,
    intent: 'Enter policy reference',
    actionText: 'Enter policy ref',
    expectedText: 'Policy ref is accepted',
    normalizedIntent: 'enter policy ref => policy ref is accepted',
    allowedActions: ['input'],
    explicitResolution: explicit ? {
      action: 'input',
      screen: createScreenId('policy-search'),
      element: createElementId('policyNumberInput'),
      posture: null,
      snapshot_template: null,
      override: null,
    } : null,
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
      evidenceRefs: [],
      confidenceOverlays: [],
      controls: {
        datasets: [],
        resolutionControls: [],
        runbooks: [],
      },
    },
    taskFingerprint: 'sha256:task',
  };
}

test('provider capability negotiation rejects incompatible mode', () => {
  const provider: RuntimeProvider = {
    id: 'no-dom',
    capabilities: {
      supportsTranslation: true,
      supportsDom: false,
      supportsProposalDrafts: true,
      deterministicMode: false,
    },
    resolveStep: async (task, context) => runResolutionPipeline(task, context as RuntimeStepAgentContext),
  };
  const registry = createRuntimeProviderRegistry([provider]);

  expect(() => resolveRuntimeProvider({
    providerId: 'no-dom',
    mode: 'playwright',
    translationEnabled: true,
    registry,
  })).toThrow(/cannot run in playwright mode/);
});

test('post-provider validation enforces governance invariants', async () => {
  const interpretation = await runResolutionPipeline(baseStep(true), {
    provider: 'deterministic-runtime-step-agent',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
  });
  const execution: StepExecutionReceipt = {
    version: 1 as const,
    stage: 'execution' as const,
    scope: 'step' as const,
    ids: {
      adoId: null,
      suite: null,
      runId: null,
      stepIndex: 1,
      dataset: null,
      runbook: null,
      resolutionControl: null,
    },
    fingerprints: {
      artifact: 'sha256:task',
      task: 'sha256:task',
      knowledge: 'sha256:knowledge',
      controls: null,
      run: null,
    },
    lineage: {
      sources: [],
      parents: ['sha256:task'],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
    governance: 'approved' as const,
    taskFingerprint: 'sha256:task',
    knowledgeFingerprint: 'sha256:knowledge',
    mode: 'diagnostic',
    runAt: '2026-03-09T00:00:00.000Z',
    stepIndex: 1,
    widgetContract: null,
    locatorStrategy: null,
    locatorRung: null,
    degraded: false,
    preconditionFailures: [],
    durationMs: 0,
    timing: { setupMs: 0, resolutionMs: 0, actionMs: 0, assertionMs: 0, retriesMs: 0, teardownMs: 0, totalMs: 0 },
    cost: { instructionCount: 0, diagnosticCount: 0 },
    budget: { thresholds: {}, status: 'within-budget' as const, breaches: [] },
    failure: { family: 'none' },
    recovery: {
      policyProfile: 'none',
      attempts: [],
    },
    handshakes: ['preparation', 'resolution', 'execution'] as const,
    execution: { status: 'ok' as const, observedEffects: [], diagnostics: [] },
  };

  expect(() => validateStepResults({
    providerId: 'deterministic-runtime-step-agent',
    results: [{ interpretation: { ...interpretation, governance: 'approved' }, execution }],
  })).not.toThrow();

  expect(() => validateStepResults({
    providerId: 'deterministic-runtime-step-agent',
    results: [{
      interpretation: {
        ...interpretation,
        kind: 'needs-human',
        governance: 'approved',
        reason: 'manual',
        confidence: 'unbound',
      } as Parameters<typeof validateStepResults>[0]['results'][number]['interpretation'],
      execution,
    }],
  })).toThrow(/needs-human governance/);
});
