import { expect, test } from '@playwright/test';
import { createResolutionEngineRegistry, resolveResolutionEngine, type ResolutionEngine } from '../../product/application/resolution/resolution-engine';
import { validateStepResults } from '../../product/application/commitment/validate-step-results';
import { runResolutionPipeline } from '../../product/runtime/resolution';
import type { RuntimeStepAgentContext } from '../../product/runtime/resolution/types';
import type { StepExecutionReceipt } from '../../product/domain/execution/types';
import { createAgentContext, createInterfaceResolutionContext, createGroundedStep } from '../support/interface-fixtures';
import { asFingerprint } from '../../product/domain/kernel/hash';

function baseFixture(explicit = false) {
  const resolutionContext = createInterfaceResolutionContext();
  const task = createGroundedStep({
    explicitResolution: explicit ? {
      action: 'input',
      screen: resolutionContext.screens[0]!.screen,
      element: resolutionContext.screens[0]!.elements[0]!.element,
      posture: null,
      snapshot_template: null,
      override: null,
    } : null,
    allowedActions: ['input'],
  }, resolutionContext);
  return { task, resolutionContext };
}

test('provider capability negotiation rejects incompatible mode', () => {
  const provider: ResolutionEngine = {
    id: 'no-dom',
    capabilities: {
      supportsTranslation: true,
      supportsDom: false,
      supportsProposalDrafts: true,
      deterministicMode: false,
    },
    resolveStep: async (task, context) => {
      const result = await runResolutionPipeline(task, context as RuntimeStepAgentContext);
      return {
        receipt: result.receipt,
        semanticAccrual: result.semanticAccrual ?? null,
        semanticDictionaryHitId: result.semanticDictionaryHitId ?? null,
      };
    },
  };
  const registry = createResolutionEngineRegistry([provider]);

  expect(() => resolveResolutionEngine({
    providerId: 'no-dom',
    mode: 'playwright',
    translationEnabled: true,
    registry,
  })).toThrow(/cannot run in playwright mode/);
});

test('post-provider validation enforces governance invariants', async () => {
  const { task, resolutionContext } = baseFixture(true);
  const { receipt: interpretation } = await runResolutionPipeline(task, createAgentContext(resolutionContext, {
    provider: 'deterministic-runtime-step-agent',
  }));
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
      artifact: asFingerprint('artifact', 'sha256:task'),
      content: null,
      surface: asFingerprint('surface', 'sha256:task'),
      knowledge: asFingerprint('knowledge', 'sha256:knowledge'),
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
