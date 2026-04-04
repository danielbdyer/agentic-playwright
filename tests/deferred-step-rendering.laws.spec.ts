/**
 * Deferred-Step Rendering Laws
 *
 * Intent-only and deferred-binding steps must be visually distinct in emitted code.
 * These tests verify that the spec codegen pipeline produces the correct comment
 * markers for each step confidence/binding combination.
 */

import { expect, test } from '@playwright/test';
import { renderReadableSpecModule } from '../lib/domain/codegen/spec-codegen';
import type { GroundedFlowStep, GroundedSpecFlow } from '../lib/domain/types';
import type { Confidence, StepBindingKind } from '../lib/domain/governance/workflow-types';
import { createAdoId, createScreenId, createElementId } from '../lib/domain/kernel/identity';
import { mulberry32 } from './support/random';

// ─── Helpers ───

function makeStep(overrides: {
  readonly index: number;
  readonly confidence: Confidence;
  readonly bindingKind: StepBindingKind;
  readonly intent?: string;
}): GroundedFlowStep {
  return {
    index: overrides.index,
    intent: overrides.intent ?? `Step ${overrides.index}`,
    action: 'click',
    screen: createScreenId('test-screen'),
    element: createElementId('test-element'),
    posture: null,
    snapshotTemplate: null,
    dataValue: null,
    dataSource: 'none',
    confidence: overrides.confidence,
    governance: 'approved',
    bindingKind: overrides.bindingKind,
    provenanceKind: 'explicit',
    normalizedIntent: overrides.intent ?? `step ${overrides.index}`,
    knowledgeRefs: [],
    supplementRefs: [],
  };
}

function makeFlow(steps: ReadonlyArray<GroundedFlowStep>): GroundedSpecFlow {
  return {
    kind: 'grounded-spec-flow',
    metadata: {
      adoId: createAdoId('ADO-999'),
      revision: 1,
      contentHash: 'abc123',
      title: 'Test scenario',
      suite: 'test-suite',
      tags: [],
      lifecycle: 'normal',
      confidence: 'compiler-derived',
      governance: 'approved',
      fixtures: [],
    },
    steps,
  };
}

const DEFAULT_OPTIONS = {
  imports: {
    fixtures: '../fixtures/index',
    scenarioContext: '../lib/composition/scenario-context',
  },
};

// ─── Law: Intent-only steps produce // [intent-only] markers ───

test('intent-only steps produce // [intent-only] comment marker in emitted code', () => {
  const flow = makeFlow([
    makeStep({ index: 0, confidence: 'intent-only', bindingKind: 'bound' }),
  ]);

  const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
  expect(result.code).toContain('// [intent-only]');
});

// ─── Law: Deferred steps produce // [deferred] markers ───

test('deferred-binding steps produce // [deferred] comment marker in emitted code', () => {
  const flow = makeFlow([
    makeStep({ index: 0, confidence: 'compiler-derived', bindingKind: 'deferred' }),
  ]);

  const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
  expect(result.code).toContain('// [deferred]');
});

// ─── Law: Grounded steps do NOT produce markers ───

test('grounded (bound, non-intent-only) steps do NOT produce intent/deferred markers', () => {
  const groundedConfidences: ReadonlyArray<Confidence> = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived'];

  for (const confidence of groundedConfidences) {
    const flow = makeFlow([
      makeStep({ index: 0, confidence, bindingKind: 'bound' }),
    ]);

    const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
    expect(result.code).not.toContain('// [intent-only]');
    expect(result.code).not.toContain('// [deferred]');
  }
});

// ─── Law: Intent-only takes precedence over deferred ───

test('intent-only confidence takes precedence over deferred binding for marker', () => {
  const flow = makeFlow([
    makeStep({ index: 0, confidence: 'intent-only', bindingKind: 'deferred' }),
  ]);

  const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
  expect(result.code).toContain('// [intent-only]');
  // Should not also have deferred marker for the same step
  expect(result.code).not.toContain('// [deferred]');
});

// ─── Law: Markers survive round-trip through emit pipeline ───

test('markers survive round-trip: mixed steps produce correct markers per step', () => {
  const flow = makeFlow([
    makeStep({ index: 0, confidence: 'compiler-derived', bindingKind: 'bound', intent: 'Navigate to screen' }),
    makeStep({ index: 1, confidence: 'intent-only', bindingKind: 'bound', intent: 'Enter value' }),
    makeStep({ index: 2, confidence: 'compiler-derived', bindingKind: 'deferred', intent: 'Click button' }),
    makeStep({ index: 3, confidence: 'human', bindingKind: 'bound', intent: 'Assert result' }),
  ]);

  const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);

  // Count marker occurrences
  const intentOnlyCount = (result.code.match(/\/\/ \[intent-only\]/g) ?? []).length;
  const deferredCount = (result.code.match(/\/\/ \[deferred\]/g) ?? []).length;

  expect(intentOnlyCount).toBe(1);
  expect(deferredCount).toBe(1);
});

// ─── Law: Deterministic rendering with random step ordering ───

test('marker assignment is deterministic across random step orderings', () => {
  const rng = mulberry32(42);
  const confidences: ReadonlyArray<Confidence> = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only'];
  const bindings: ReadonlyArray<StepBindingKind> = ['bound', 'deferred', 'unbound'];

  // Generate a random flow
  const stepCount = 3 + Math.floor(rng() * 5);
  const steps = Array.from({ length: stepCount }, (_, i) =>
    makeStep({
      index: i,
      confidence: confidences[Math.floor(rng() * confidences.length)]!,
      bindingKind: bindings[Math.floor(rng() * bindings.length)]!,
      intent: `Random step ${i}`,
    }),
  );

  const flow = makeFlow(steps);

  // Render twice — must be identical
  const first = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
  const second = renderReadableSpecModule(flow, DEFAULT_OPTIONS);

  expect(first.code).toBe(second.code);
});

// ─── Law: Skip/fixme lifecycle suppresses step markers (no steps emitted) ───

test('skip lifecycle does not emit step markers', () => {
  const flow: GroundedSpecFlow = {
    ...makeFlow([
      makeStep({ index: 0, confidence: 'intent-only', bindingKind: 'deferred' }),
    ]),
    metadata: {
      ...makeFlow([]).metadata,
      lifecycle: 'skip',
    },
  };

  const result = renderReadableSpecModule(flow, DEFAULT_OPTIONS);
  expect(result.code).not.toContain('// [intent-only]');
  expect(result.code).not.toContain('// [deferred]');
});
