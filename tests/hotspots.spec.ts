import { expect, test } from '@playwright/test';
import { buildWorkflowHotspots } from '../lib/application/hotspots';
import type { InterpretationDriftRecord, RunRecord } from '../lib/domain/types';
import { createAdoId } from '../lib/domain/kernel/identity';

function fakeRun(input: {
  adoId: string;
  runId: string;
  completedAt: string;
  steps: Array<{
    stepIndex: number;
    kind?: 'resolved' | 'needs-human';
    screen: string;
    element?: string;
    action: string;
    winningSource: string;
    resolutionMode: string;
    status?: 'ok' | 'failed';
    degraded?: boolean;
    locatorRung?: number | null;
    widgetContract?: string | null;
  }>;
}): RunRecord {
  return {
    kind: 'scenario-run-record',
    version: 1,
    stage: 'execution',
    scope: 'run',
    ids: {},
    fingerprints: { artifact: 'sha256:test' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'approved',
    payload: {} as never,
    runId: input.runId,
    adoId: createAdoId(input.adoId),
    revision: 1,
    title: 'test',
    suite: 'demo/test',
    taskFingerprint: 'task',
    knowledgeFingerprint: 'knowledge',
    provider: 'test',
    mode: 'diagnostic',
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    evidenceIds: [],
    translationMetrics: {
      total: 0,
      hits: 0,
      misses: 0,
      disabled: 0,
      hitRate: 0,
      missReasons: {},
      failureClasses: {},
    },
    steps: input.steps.map((step) => ({
      stepIndex: step.stepIndex,
      evidenceIds: [],
      interpretation: {
        kind: step.kind ?? 'resolved',
        target: {
          action: step.action,
          screen: step.screen,
          element: step.element ?? null,
        },
        winningSource: step.winningSource,
        resolutionMode: step.resolutionMode,
      } as never,
      execution: {
        degraded: step.degraded ?? false,
        locatorRung: step.locatorRung ?? null,
        widgetContract: step.widgetContract ?? null,
        execution: {
          status: step.status ?? 'ok',
        },
      } as never,
    })),
  } as unknown as RunRecord;
}


function fakeDrift(input: {
  adoId: string;
  runId: string;
  stepIndex: number;
  changedFields: Array<'winningSource' | 'target' | 'governance' | 'confidence' | 'exhaustion-path'>;
}): InterpretationDriftRecord {
  return {
    kind: 'interpretation-drift-record',
    version: 1,
    stage: 'resolution',
    scope: 'run',
    ids: {},
    fingerprints: { artifact: 'sha256:test' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'review-required',
    adoId: createAdoId(input.adoId),
    runId: input.runId,
    comparedRunId: 'older-run',
    providerId: 'deterministic-runtime-step-agent',
    mode: 'diagnostic',
    comparedAt: '2025-01-01T00:00:00.000Z',
    changedStepCount: 1,
    unchangedStepCount: 0,
    totalStepCount: 1,
    hasDrift: true,
    provenance: {
      taskFingerprint: 'task',
      knowledgeFingerprint: 'knowledge',
      controlsFingerprint: null,
      comparedTaskFingerprint: 'task-old',
      comparedKnowledgeFingerprint: 'knowledge-old',
      comparedControlsFingerprint: null,
    },
    explainableByFingerprintDelta: true,
    steps: [{
      stepIndex: input.stepIndex,
      changed: true,
      changes: input.changedFields.map((field) => ({ field, before: 'a', after: 'b' })),
      before: { winningSource: 'approved-knowledge', target: 'a', governance: 'approved', confidence: 'compiler-derived', exhaustionPath: [] },
      after: { winningSource: 'live-dom', target: 'b', governance: 'review-required', confidence: 'agent-verified', exhaustionPath: ['live-dom:resolved'] },
    }],
  } as unknown as InterpretationDriftRecord;
}


test('hotspots group repeated wins deterministically and map to canonical targets', () => {
  const hotspots = buildWorkflowHotspots([
    fakeRun({
      adoId: '10001',
      runId: 'run-10001-new',
      completedAt: '2025-01-01T00:00:00.000Z',
      steps: [
        {
          stepIndex: 1,
          screen: 'policy-search',
          element: 'policyNumberInput',
          action: 'input',
          winningSource: 'structured-translation',
          resolutionMode: 'translation',
        },
        {
          stepIndex: 2,
          screen: 'policy-search',
          element: 'policyNumberInput',
          action: 'input',
          winningSource: 'structured-translation',
          resolutionMode: 'translation',
          degraded: true,
          locatorRung: 3,
        },
      ],
    }),
    fakeRun({
      adoId: '10001',
      runId: 'run-10001-old',
      completedAt: '2024-12-30T00:00:00.000Z',
      steps: [
        {
          stepIndex: 99,
          screen: 'policy-search',
          element: 'legacy',
          action: 'input',
          winningSource: 'structured-translation',
          resolutionMode: 'translation',
        },
      ],
    }),
    fakeRun({
      adoId: '10002',
      runId: 'run-10002-new',
      completedAt: '2025-01-01T00:00:00.000Z',
      steps: [
        {
          stepIndex: 1,
          screen: 'coverage-details',
          element: 'policyNumberInput',
          action: 'input',
          winningSource: 'structured-translation',
          resolutionMode: 'translation',
        },
        {
          stepIndex: 2,
          screen: 'coverage-details',
          element: 'submitWidget',
          action: 'custom',
          winningSource: 'live-dom',
          resolutionMode: 'agentic',
          widgetContract: 'widget:table',
        },
      ],
    }),
  ], [
    fakeDrift({ adoId: '10001', runId: 'run-10001-new', stepIndex: 3, changedFields: ['target', 'winningSource'] }),
  ]);

  expect(hotspots.map((entry) => entry.id)).toEqual([
    'translation-win:policy-search:policyNumberInput:input',
    'interpretation-drift:10001:b:live-dom',
    'translation-win:coverage-details:policyNumberInput:input',
    'agentic-fallback-win:coverage-details:submitWidget:custom',
    'degraded-locator-rung:policy-search:policyNumberInput:input',
  ]);

  expect(hotspots[0]?.occurrenceCount).toBe(2);
  expect(hotspots[0]?.samples.every((sample) => sample.stepIndex !== 99)).toBeTruthy();
  expect(hotspots[0]?.suggestions.map((entry) => entry.target)).toEqual([
    'knowledge/screens/policy-search.hints.yaml',
    'knowledge/patterns/*.yaml',
  ]);
  const agenticHotspot = hotspots.find((entry) => entry.kind === 'agentic-fallback-win' && entry.family.action === 'custom');
  expect(agenticHotspot?.suggestions.map((entry) => entry.target)).toContain('knowledge/components/*.ts');
});
