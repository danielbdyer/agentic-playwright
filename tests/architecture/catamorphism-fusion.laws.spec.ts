/**
 * Catamorphism Fusion — Algebraic Law Tests (W5.2)
 *
 * Verifies the fusion law for all 8 fold functions in visitors.ts:
 *   f . fold(g) = fold(f . g)
 *
 * Concretely: applying fold to get an intermediate result R1, then
 * applying a pure function f to get R2, must equal applying a single
 * fold whose cases are pre-composed with f. This is the fundamental
 * theorem of catamorphisms — it guarantees that folds compose without
 * intermediate allocations.
 *
 * Tested folds:
 *   foldValueRef, foldStepInstruction, foldLocatorStrategy,
 *   foldResolutionReceipt, foldResolutionOutcome, foldImprovementTarget,
 *   foldResolutionEvent, foldPipelineFailureClass
 */

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
import { mulberry32, pick , LAW_SEED_COUNT } from '../support/random';
import { asFingerprint } from '../../product/domain/kernel/hash';

// ─── Pure transformers for fusion testing ───

const STRING_TRANSFORMERS: readonly ((s: string) => number)[] = [
  (s) => s.length,
  (s) => s.charCodeAt(0) || 0,
  (s) => s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0),
  (s) => s === '' ? 0 : 1,
  (s) => s.length * 3 + 7,
];

const NUMBER_TRANSFORMERS: readonly ((n: number) => string)[] = [
  (n) => String(n),
  (n) => n > 5 ? 'big' : 'small',
  (n) => 'x'.repeat(Math.min(n, 20)),
  (n) => `[${n}]`,
  (n) => n % 2 === 0 ? 'even' : 'odd',
];

// ─── Specimen values for each union type ───

const VALUE_REF_SPECIMENS: readonly ValueRef[] = [
  { kind: 'literal', value: 'hello' },
  { kind: 'fixture-path', path: { segments: ['a', 'b'] } },
  { kind: 'posture-sample', element: 'el' as never, posture: 'pos' as never, sampleIndex: 42 },
  { kind: 'parameter-row', name: 'param', rowIndex: 1 },
  { kind: 'generated-token', token: 'tok-abc' },
];

const STEP_INSTRUCTION_SPECIMENS: readonly StepInstruction[] = [
  { kind: 'navigate', screen: 'Screen1' as never },
  { kind: 'enter', screen: 'Screen1' as never, element: 'Field1' as never, posture: null, value: null },
  { kind: 'invoke', screen: 'Screen1' as never, element: 'Btn1' as never, action: 'click' },
  { kind: 'observe-structure', screen: 'Screen1' as never, element: 'Grid1' as never, snapshotTemplate: 'T1' as never },
  { kind: 'custom-escape-hatch', reason: 'manual step' },
];

const LOCATOR_STRATEGY_SPECIMENS: readonly LocatorStrategy[] = [
  { kind: 'test-id', value: 'btn-submit' },
  { kind: 'role-name', role: 'button', name: 'Submit' },
  { kind: 'role-name', role: 'textbox', name: null },
  { kind: 'css', value: '.btn-primary' },
];

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

const RECEIPT_BASE = makeReceiptBase();

const RESOLUTION_RECEIPT_SPECIMENS: readonly ResolutionReceipt[] = [
  { ...RECEIPT_BASE, kind: 'resolved', confidence: 'compiler-derived', provenanceKind: 'explicit', target: { action: 'click', screen: 'S1' as never } },
  { ...RECEIPT_BASE, kind: 'resolved-with-proposals', confidence: 'agent-proposed', provenanceKind: 'live-exploration', target: { action: 'click', screen: 'S2' as never } },
  { ...RECEIPT_BASE, kind: 'needs-human', governance: 'review-required', confidence: 'unbound', provenanceKind: 'unresolved', reason: 'could not resolve' },
];

const IMPROVEMENT_TARGET_SPECIMENS: readonly PipelineImprovementTarget[] = [
  { kind: 'translation', detail: 'detail-t' },
  { kind: 'scoring', detail: 'detail-s' },
  { kind: 'resolution', detail: 'detail-r' },
  { kind: 'recovery', detail: 'detail-c' },
  { kind: 'trust-policy', detail: 'detail-p' },
];

const RESOLUTION_EVENT_SPECIMENS: readonly ResolutionEvent[] = [
  { kind: 'exhaustion-recorded', entry: { stage: 'scenario-explicit' as never, outcome: 'attempted', reason: 'r' } },
  { kind: 'observation-recorded', observation: { source: 'runtime', summary: 's' } },
  { kind: 'refs-collected', refKind: 'knowledge', refs: ['ref1'] },
  { kind: 'memory-updated', session: { currentScreen: null, activeStateRefs: [], lastObservedTransitionRefs: [], activeRouteVariantRefs: [], activeTargetRefs: [], lastSuccessfulLocatorRung: null, recentAssertions: [], causalLinks: [], lineage: [] } },
  { kind: 'receipt-produced', receipt: { kind: 'needs-human' } as never },
];

const FAILURE_CLASS_SPECIMENS: readonly PipelineFailureClass[] = [
  'translation-threshold-miss',
  'translation-normalization-gap',
  'alias-coverage-gap',
  'resolution-rung-skip',
  'scoring-weight-mismatch',
  'recovery-strategy-miss',
  'convergence-stall',
  'trust-policy-over-block',
];

// ─── Fusion law: foldValueRef ───

test.describe('Fusion: foldValueRef', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, VALUE_REF_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        literal: (r: { value: string }) => r.value,
        fixturePath: (r: { path: { segments: readonly string[] } }) => r.path.segments.join('/'),
        postureSample: (r: { element: string }) => String(r.element),
        parameterRow: (r: { name: string }) => r.name,
        generatedToken: (r: { token: string }) => r.token,
      };

      // Two-step: fold to string, then apply f
      const twoStep = f(foldValueRef(specimen, stringCases));

      // Fused: fold directly to number via f . g
      const fused = foldValueRef(specimen, {
        literal: (r) => f(stringCases.literal(r)),
        fixturePath: (r) => f(stringCases.fixturePath(r)),
        postureSample: (r) => f(stringCases.postureSample(r)),
        parameterRow: (r) => f(stringCases.parameterRow(r)),
        generatedToken: (r) => f(stringCases.generatedToken(r)),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldStepInstruction ───

test.describe('Fusion: foldStepInstruction', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, STEP_INSTRUCTION_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        navigate: (i: { screen: string }) => String(i.screen),
        enter: (i: { element: string }) => String(i.element),
        invoke: (i: { action: string }) => i.action,
        observeStructure: (i: { snapshotTemplate: string }) => String(i.snapshotTemplate),
        customEscapeHatch: (i: { reason: string }) => i.reason,
      };

      const twoStep = f(foldStepInstruction(specimen, stringCases));

      const fused = foldStepInstruction(specimen, {
        navigate: (i) => f(stringCases.navigate(i)),
        enter: (i) => f(stringCases.enter(i)),
        invoke: (i) => f(stringCases.invoke(i)),
        observeStructure: (i) => f(stringCases.observeStructure(i)),
        customEscapeHatch: (i) => f(stringCases.customEscapeHatch(i)),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldLocatorStrategy ───

test.describe('Fusion: foldLocatorStrategy', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, LOCATOR_STRATEGY_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        testId: (s: { value: string }) => s.value,
        roleName: (s: { role: string; name?: string | null | undefined }) => `${s.role}:${s.name ?? ''}`,
        css: (s: { value: string }) => s.value,
      };

      const twoStep = f(foldLocatorStrategy(specimen, stringCases));

      const fused = foldLocatorStrategy(specimen, {
        testId: (s) => f(stringCases.testId(s)),
        roleName: (s) => f(stringCases.roleName(s as { role: string; name?: string | null | undefined })),
        css: (s) => f(stringCases.css(s)),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldResolutionReceipt ───

test.describe('Fusion: foldResolutionReceipt', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, RESOLUTION_RECEIPT_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        resolved: () => 'resolved',
        resolvedWithProposals: () => 'resolved-with-proposals',
        agentInterpreted: () => 'agent-interpreted',
        needsHuman: () => 'needs-human',
      };

      const twoStep = f(foldResolutionReceipt(specimen, stringCases));

      const fused = foldResolutionReceipt(specimen, {
        resolved: () => f(stringCases.resolved()),
        resolvedWithProposals: () => f(stringCases.resolvedWithProposals()),
        agentInterpreted: () => f(stringCases.agentInterpreted()),
        needsHuman: () => f(stringCases.needsHuman()),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldResolutionOutcome ───

test.describe('Fusion: foldResolutionOutcome', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, RESOLUTION_RECEIPT_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        resolved: (r: { kind: string }) => r.kind,
        needsHuman: (r: { kind: string }) => r.kind,
      };

      const twoStep = f(foldResolutionOutcome(specimen, stringCases));

      const fused = foldResolutionOutcome(specimen, {
        resolved: (r) => f(stringCases.resolved(r)),
        needsHuman: (r) => f(stringCases.needsHuman(r)),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldImprovementTarget ───

test.describe('Fusion: foldImprovementTarget', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, IMPROVEMENT_TARGET_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        translation: (t: { detail: string }) => t.detail,
        scoring: (t: { detail: string }) => t.detail,
        resolution: (t: { detail: string }) => t.detail,
        recovery: (t: { detail: string }) => t.detail,
        trustPolicy: (t: { detail: string }) => t.detail,
      };

      const twoStep = f(foldImprovementTarget(specimen, stringCases));

      const fused = foldImprovementTarget(specimen, {
        translation: (t) => f(stringCases.translation(t)),
        scoring: (t) => f(stringCases.scoring(t)),
        resolution: (t) => f(stringCases.resolution(t)),
        recovery: (t) => f(stringCases.recovery(t)),
        trustPolicy: (t) => f(stringCases.trustPolicy(t)),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldResolutionEvent ───

test.describe('Fusion: foldResolutionEvent', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, RESOLUTION_EVENT_SPECIMENS);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        exhaustionRecorded: (e: { entry: { reason: string } }) => e.entry.reason,
        observationRecorded: (e: { observation: { summary: string } }) => e.observation.summary,
        refsCollected: (e: { refKind: string }) => e.refKind,
        memoryUpdated: () => 'memory',
        receiptProduced: () => 'receipt',
      };

      const twoStep = f(foldResolutionEvent(specimen, stringCases));

      const fused = foldResolutionEvent(specimen, {
        exhaustionRecorded: (e) => f(stringCases.exhaustionRecorded(e)),
        observationRecorded: (e) => f(stringCases.observationRecorded(e)),
        refsCollected: (e) => f(stringCases.refsCollected(e)),
        memoryUpdated: () => f(stringCases.memoryUpdated()),
        receiptProduced: () => f(stringCases.receiptProduced()),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Fusion law: foldPipelineFailureClass ───

test.describe('Fusion: foldPipelineFailureClass', () => {
  test('f . fold(g) === fold(f . g) for all variants across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const specimen = pick(next, FAILURE_CLASS_SPECIMENS);
      const g = pick(next, NUMBER_TRANSFORMERS);

      const numberCases = {
        translationThresholdMiss: () => 0,
        translationNormalizationGap: () => 1,
        aliasCoverageGap: () => 2,
        resolutionRungSkip: () => 3,
        scoringWeightMismatch: () => 4,
        recoveryStrategyMiss: () => 5,
        convergenceStall: () => 6,
        trustPolicyOverBlock: () => 7,
      };

      // Two-step: fold to number, then apply g
      const twoStep = g(foldPipelineFailureClass(specimen, numberCases));

      // Fused: fold directly to string via g . numberCases
      const fused = foldPipelineFailureClass(specimen, {
        translationThresholdMiss: () => g(numberCases.translationThresholdMiss()),
        translationNormalizationGap: () => g(numberCases.translationNormalizationGap()),
        aliasCoverageGap: () => g(numberCases.aliasCoverageGap()),
        resolutionRungSkip: () => g(numberCases.resolutionRungSkip()),
        scoringWeightMismatch: () => g(numberCases.scoringWeightMismatch()),
        recoveryStrategyMiss: () => g(numberCases.recoveryStrategyMiss()),
        convergenceStall: () => g(numberCases.convergenceStall()),
        trustPolicyOverBlock: () => g(numberCases.trustPolicyOverBlock()),
      });

      expect(fused).toBe(twoStep);
    }
  });
});

// ─── Meta-law: fold distributes over array map ───

test.describe('Meta-law: fold distributes over Array.map', () => {
  test('values.map(fold(g)).map(f) === values.map(fold(f . g)) for ValueRef across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const f = pick(next, STRING_TRANSFORMERS);

      const stringCases = {
        literal: (r: { value: string }) => r.value,
        fixturePath: (r: { path: { segments: readonly string[] } }) => r.path.segments.join('/'),
        postureSample: (r: { element: string }) => String(r.element),
        parameterRow: (r: { name: string }) => r.name,
        generatedToken: (r: { token: string }) => r.token,
      };

      const twoPass = VALUE_REF_SPECIMENS
        .map((v) => foldValueRef(v, stringCases))
        .map(f);

      const onePass = VALUE_REF_SPECIMENS.map((v) =>
        foldValueRef(v, {
          literal: (r) => f(stringCases.literal(r)),
          fixturePath: (r) => f(stringCases.fixturePath(r)),
          postureSample: (r) => f(stringCases.postureSample(r)),
          parameterRow: (r) => f(stringCases.parameterRow(r)),
          generatedToken: (r) => f(stringCases.generatedToken(r)),
        }),
      );

      expect(onePass).toEqual(twoPass);
    }
  });
});
