import { expect, test } from '@playwright/test';
import {
  foldValueRef,
  foldStepInstruction,
  foldLocatorStrategy,
  foldResolutionReceipt,
  foldResolutionOutcome,
  foldImprovementTarget,
  foldResolutionEvent,
  foldPipelineFailureClass,
} from '../../product/domain/kernel/visitors';
import type { PipelineFailureClass, PipelineImprovementTarget } from '../../workshop/metrics/types';
import type { LocatorStrategy } from '../../product/domain/governance/workflow-types';
import type { StepInstruction, ValueRef } from '../../product/domain/intent/types';
import type { ResolutionEvent, ResolutionReceipt } from '../../product/domain/resolution/types';
import { asFingerprint } from '../../product/domain/kernel/hash';

// ─── Law: every fold dispatches to exactly one case ───

test('foldValueRef dispatches each variant to the correct case', () => {
  const variants: readonly ValueRef[] = [
    { kind: 'literal', value: 'hello' },
    { kind: 'fixture-path', path: { segments: ['a', 'b'] } },
    { kind: 'posture-sample', element: 'el' as never, posture: 'pos' as never, sampleIndex: 0 },
    { kind: 'parameter-row', name: 'param', rowIndex: 1 },
    { kind: 'generated-token', token: 'tok' },
  ];

  const results = variants.map((v) =>
    foldValueRef(v, {
      literal: () => 'literal',
      fixturePath: () => 'fixture-path',
      postureSample: () => 'posture-sample',
      parameterRow: () => 'parameter-row',
      generatedToken: () => 'generated-token',
    }),
  );

  expect(results).toEqual(['literal', 'fixture-path', 'posture-sample', 'parameter-row', 'generated-token']);
});

test('foldValueRef preserves the typed payload in each case', () => {
  const literal: ValueRef = { kind: 'literal', value: 'test-value' };
  const result = foldValueRef(literal, {
    literal: (ref) => ref.value,
    fixturePath: () => 'wrong',
    postureSample: () => 'wrong',
    parameterRow: () => 'wrong',
    generatedToken: () => 'wrong',
  });
  expect(result).toBe('test-value');
});

// ─── StepInstruction ───

test('foldStepInstruction dispatches each variant to the correct case', () => {
  const variants: readonly StepInstruction[] = [
    { kind: 'navigate', screen: 'Screen1' as never },
    { kind: 'enter', screen: 'Screen1' as never, element: 'Field1' as never, posture: null, value: null },
    { kind: 'invoke', screen: 'Screen1' as never, element: 'Btn1' as never, action: 'click' },
    { kind: 'observe-structure', screen: 'Screen1' as never, element: 'Grid1' as never, snapshotTemplate: 'T1' as never },
    { kind: 'custom-escape-hatch', reason: 'manual step' },
  ];

  const results = variants.map((v) =>
    foldStepInstruction(v, {
      navigate: () => 'navigate',
      enter: () => 'enter',
      invoke: () => 'invoke',
      observeStructure: () => 'observe-structure',
      customEscapeHatch: () => 'custom-escape-hatch',
    }),
  );

  expect(results).toEqual(['navigate', 'enter', 'invoke', 'observe-structure', 'custom-escape-hatch']);
});

// ─── LocatorStrategy ───

test('foldLocatorStrategy dispatches each variant to the correct case', () => {
  const variants: readonly LocatorStrategy[] = [
    { kind: 'role', role: 'button', name: 'Submit' },
    { kind: 'label', value: 'Username' },
    { kind: 'placeholder', value: 'Type here' },
    { kind: 'text', value: 'Continue' },
    { kind: 'test-id', value: 'btn-submit' },
    { kind: 'css', value: '.btn-primary' },
  ];

  const results = variants.map((v) =>
    foldLocatorStrategy(v, {
      role: (s) => `role:${s.role}`,
      label: (s) => `label:${s.value}`,
      placeholder: (s) => `placeholder:${s.value}`,
      text: (s) => `text:${s.value}`,
      testId: (s) => `test-id:${s.value}`,
      css: (s) => `css:${s.value}`,
    }),
  );

  expect(results).toEqual([
    'role:button',
    'label:Username',
    'placeholder:Type here',
    'text:Continue',
    'test-id:btn-submit',
    'css:.btn-primary',
  ]);
});

// ─── ResolutionReceipt ───

function makeReceiptBase() {
  return {
    version: 1 as const,
    stage: 'resolution' as const,
    scope: 'step' as const,
    ids: {},
    fingerprints: { artifact: asFingerprint('artifact', 'fp') },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'approved' as const,
    taskFingerprint: 'tf',
    knowledgeFingerprint: 'kf',
    provider: 'test',
    mode: 'test',
    runAt: '2026-01-01',
    stepIndex: 0,
    resolutionMode: 'deterministic' as const,
    knowledgeRefs: [],
    supplementRefs: [],
    controlRefs: [],
    evidenceRefs: [],
    overlayRefs: [],
    observations: [],
    exhaustion: [],
    handshakes: ['resolution' as const],
    winningConcern: 'resolution' as const,
    winningSource: 'scenario-explicit' as const,
    evidenceDrafts: [],
    proposalDrafts: [],
  };
}

test('foldResolutionReceipt dispatches each variant', () => {
  const base = makeReceiptBase();

  const resolved: ResolutionReceipt = {
    ...base,
    kind: 'resolved',
    confidence: 'compiler-derived',
    provenanceKind: 'explicit',
    target: { action: 'click', screen: 'S' as never },
  };

  const withProposals: ResolutionReceipt = {
    ...base,
    kind: 'resolved-with-proposals',
    confidence: 'agent-proposed',
    provenanceKind: 'live-exploration',
    target: { action: 'click', screen: 'S' as never },
  };

  const needsHuman: ResolutionReceipt = {
    ...base,
    kind: 'needs-human',
    governance: 'review-required',
    confidence: 'unbound',
    provenanceKind: 'unresolved',
    reason: 'could not resolve',
  };

  const cases = {
    resolved: () => 'resolved',
    resolvedWithProposals: () => 'resolved-with-proposals',
    agentInterpreted: () => 'agent-interpreted',
    needsHuman: () => 'needs-human',
  };

  expect(foldResolutionReceipt(resolved, cases)).toBe('resolved');
  expect(foldResolutionReceipt(withProposals, cases)).toBe('resolved-with-proposals');
  expect(foldResolutionReceipt(needsHuman, cases)).toBe('needs-human');
});

test('foldResolutionOutcome merges resolved variants into one case', () => {
  const base = makeReceiptBase();

  const resolved: ResolutionReceipt = {
    ...base,
    kind: 'resolved',
    confidence: 'compiler-derived',
    provenanceKind: 'explicit',
    target: { action: 'click', screen: 'S' as never },
  };

  const withProposals: ResolutionReceipt = {
    ...base,
    kind: 'resolved-with-proposals',
    confidence: 'agent-proposed',
    provenanceKind: 'live-exploration',
    target: { action: 'click', screen: 'S' as never },
  };

  const needsHuman: ResolutionReceipt = {
    ...base,
    kind: 'needs-human',
    governance: 'review-required',
    confidence: 'unbound',
    provenanceKind: 'unresolved',
    reason: 'could not resolve',
  };

  const outcomeCases = {
    resolved: (r: { target: { screen: string } }) => r.target.screen,
    needsHuman: (r: { reason: string }) => r.reason,
  };

  expect(foldResolutionOutcome(resolved, outcomeCases)).toBe('S');
  expect(foldResolutionOutcome(withProposals, outcomeCases)).toBe('S');
  expect(foldResolutionOutcome(needsHuman, outcomeCases)).toBe('could not resolve');
});

// ─── PipelineImprovementTarget ───

test('foldImprovementTarget dispatches each variant', () => {
  const variants: readonly PipelineImprovementTarget[] = [
    { kind: 'translation', detail: 'd1' },
    { kind: 'scoring', detail: 'd2' },
    { kind: 'resolution', detail: 'd3' },
    { kind: 'recovery', detail: 'd4' },
    { kind: 'trust-policy', detail: 'd5' },
  ];

  const results = variants.map((v) =>
    foldImprovementTarget(v, {
      translation: (t) => t.detail,
      scoring: (t) => t.detail,
      resolution: (t) => t.detail,
      recovery: (t) => t.detail,
      trustPolicy: (t) => t.detail,
    }),
  );

  expect(results).toEqual(['d1', 'd2', 'd3', 'd4', 'd5']);
});

// ─── PipelineFailureClass ───

test('foldPipelineFailureClass covers all 8 variants', () => {
  const allClasses: readonly PipelineFailureClass[] = [
    'translation-threshold-miss',
    'translation-normalization-gap',
    'alias-coverage-gap',
    'resolution-rung-skip',
    'scoring-weight-mismatch',
    'recovery-strategy-miss',
    'convergence-stall',
    'trust-policy-over-block',
  ];

  const results = allClasses.map((cls) =>
    foldPipelineFailureClass(cls, {
      translationThresholdMiss: () => 0,
      translationNormalizationGap: () => 1,
      aliasCoverageGap: () => 2,
      resolutionRungSkip: () => 3,
      scoringWeightMismatch: () => 4,
      recoveryStrategyMiss: () => 5,
      convergenceStall: () => 6,
      trustPolicyOverBlock: () => 7,
    }),
  );

  // Each variant maps to a unique index
  expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(new Set(results).size).toBe(8);
});

// ─── ResolutionEvent ───

test('foldResolutionEvent dispatches each variant', () => {
  const variants: readonly ResolutionEvent[] = [
    { kind: 'exhaustion-recorded', entry: { stage: 'scenario-explicit' as never, outcome: 'attempted', reason: 'r' } },
    { kind: 'observation-recorded', observation: { source: 'runtime', summary: 's' } },
    { kind: 'refs-collected', refKind: 'knowledge', refs: ['ref1'] },
    { kind: 'memory-updated', session: { currentScreen: null, activeStateRefs: [], lastObservedTransitionRefs: [], activeRouteVariantRefs: [], activeTargetRefs: [], lastSuccessfulLocatorRung: null, recentAssertions: [], causalLinks: [], lineage: [] } },
    { kind: 'receipt-produced', receipt: { kind: 'needs-human' } as never },
  ];

  const results = variants.map((v) =>
    foldResolutionEvent(v, {
      exhaustionRecorded: () => 'exhaustion',
      observationRecorded: () => 'observation',
      refsCollected: () => 'refs',
      memoryUpdated: () => 'memory',
      receiptProduced: () => 'receipt',
    }),
  );

  expect(results).toEqual(['exhaustion', 'observation', 'refs', 'memory', 'receipt']);
});

// ─── Law: fold is total — the return type is R, not R | undefined ───

test('foldValueRef never returns undefined when all cases return defined values', () => {
  const allVariants: readonly ValueRef[] = [
    { kind: 'literal', value: '' },
    { kind: 'fixture-path', path: { segments: [] } },
    { kind: 'posture-sample', element: '' as never, posture: '' as never, sampleIndex: 0 },
    { kind: 'parameter-row', name: '', rowIndex: 0 },
    { kind: 'generated-token', token: '' },
  ];

  for (const v of allVariants) {
    const result = foldValueRef(v, {
      literal: () => 1,
      fixturePath: () => 2,
      postureSample: () => 3,
      parameterRow: () => 4,
      generatedToken: () => 5,
    });
    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
  }
});

// ─── Law: fold composes — mapping then folding = fold with mapped cases ───

test('foldLocatorStrategy composes with map: fold(map(x)) = fold_mapped(x)', () => {
  const strategy: LocatorStrategy = { kind: 'role', role: 'button', name: 'Save' };

  // Direct fold to string then measure length
  const direct = foldLocatorStrategy(strategy, {
    role: (s) => (s.name ?? '').length,
    label: (s) => s.value.length,
    placeholder: (s) => s.value.length,
    text: (s) => s.value.length,
    testId: (s) => s.value.length,
    css: (s) => s.value.length,
  });

  // Two-step: fold to string, then measure
  const description = foldLocatorStrategy(strategy, {
    role: (s) => s.name ?? '',
    label: (s) => s.value,
    placeholder: (s) => s.value,
    text: (s) => s.value,
    testId: (s) => s.value,
    css: (s) => s.value,
  });

  expect(direct).toBe(description.length);
});
