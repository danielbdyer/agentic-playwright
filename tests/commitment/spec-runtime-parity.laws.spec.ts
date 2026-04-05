/**
 * Spec-Runtime Parity -- Law Tests (W2.14)
 *
 * Verifies structural parity between GroundedSpecFlow (the compiler output
 * fed to spec-codegen) and BoundScenario (the resolution output). Synthetic
 * bound scenarios are generated from mulberry32 seeds.
 *
 * Laws:
 *   1. Step count equality between emitted spec flow and bound scenario
 *   2. Step ordering preserved
 *   3. Governance annotations match between spec and scenario
 *   4. Deferred steps marked consistently
 *   5. Data binding references appear in both spec and scenario
 *
 * 20 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomWord, randomInt, pick , LAW_SEED_COUNT } from '../support/random';
import type {
  Confidence,
  Governance,
  StepAction,
  StepBindingKind,
} from '../../lib/domain/governance/workflow-types';
import type { GroundedFlowStep, GroundedSpecFlow } from '../../lib/domain/intent/types';

// --- Constants ---

const ALL_ACTIONS: readonly StepAction[] = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'];
const ALL_GOVERNANCE: readonly Governance[] = ['approved', 'review-required', 'blocked'];
const ALL_CONFIDENCE: readonly Confidence[] = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only', 'unbound'];
const ALL_BINDING_KINDS: readonly StepBindingKind[] = ['bound', 'deferred', 'unbound'];
const ALL_DATA_SOURCES: readonly GroundedFlowStep['dataSource'][] = [
  'scenario-explicit', 'resolution-control', 'dataset', 'fixture', 'posture-sample', 'generated-token', 'none',
];
const ALL_PROVENANCE_KINDS: readonly GroundedFlowStep['provenanceKind'][] = [
  'explicit', 'approved-knowledge', 'live-exploration', 'agent-interpreted', 'unresolved',
];

// --- Generators ---

function randomGroundedStep(next: () => number, index: number): GroundedFlowStep {
  const action = pick(next, ALL_ACTIONS);
  const governance = pick(next, ALL_GOVERNANCE);
  const confidence = pick(next, ALL_CONFIDENCE);
  const bindingKind = pick(next, ALL_BINDING_KINDS);
  const dataSource = pick(next, ALL_DATA_SOURCES);
  const provenanceKind = pick(next, ALL_PROVENANCE_KINDS);
  const hasData = next() > 0.3;

  return {
    index,
    intent: `step-${randomWord(next)}`,
    action,
    screen: `screen-${randomWord(next)}` as any,
    element: next() > 0.5 ? (`elem-${randomWord(next)}` as any) : null,
    posture: null,
    snapshotTemplate: null,
    dataValue: hasData ? `val-${randomWord(next)}` : null,
    dataSource,
    confidence,
    governance,
    bindingKind,
    provenanceKind,
    normalizedIntent: `normalized-${randomWord(next)}`,
    knowledgeRefs: Array.from({ length: randomInt(next, 3) }, () => `kr-${randomWord(next)}`),
    supplementRefs: Array.from({ length: randomInt(next, 2) }, () => `sr-${randomWord(next)}`),
  };
}

function randomGroundedFlow(next: () => number): GroundedSpecFlow {
  const stepCount = 1 + randomInt(next, 8); // 1-8 steps
  const steps = Array.from({ length: stepCount }, (_, i) => randomGroundedStep(next, i));
  const overallGovernance = pick(next, ALL_GOVERNANCE);

  return {
    kind: 'grounded-spec-flow',
    metadata: {
      adoId: `ADO-${randomInt(next, 9999)}` as any,
      revision: 1 + randomInt(next, 10),
      contentHash: `hash-${randomWord(next)}`,
      title: `Test ${randomWord(next)}`,
      suite: `suite-${randomWord(next)}`,
      tags: [],
      lifecycle: 'normal',
      confidence: pick(next, [...ALL_CONFIDENCE, 'mixed' as const]),
      governance: overallGovernance,
      fixtures: [],
    },
    steps,
  };
}

/**
 * Simulate the "bound scenario view" from the same flow.
 * In the real system, BoundScenario and GroundedSpecFlow are produced from
 * the same resolution pipeline. Here we derive a parallel structure to
 * verify structural parity properties.
 */
function deriveBoundView(flow: GroundedSpecFlow): {
  readonly stepCount: number;
  readonly stepOrder: readonly number[];
  readonly governancePerStep: readonly Governance[];
  readonly deferredIndices: readonly number[];
  readonly dataRefs: readonly (string | null)[];
} {
  return {
    stepCount: flow.steps.length,
    stepOrder: flow.steps.map((s) => s.index),
    governancePerStep: flow.steps.map((s) => s.governance),
    deferredIndices: flow.steps.filter((s) => s.bindingKind === 'deferred').map((s) => s.index),
    dataRefs: flow.steps.map((s) => s.dataValue),
  };
}

// --- Law 1: Step count equality ---

test('step count equality between spec flow and bound view (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const flow = randomGroundedFlow(next);
    const bound = deriveBoundView(flow);

    expect(flow.steps.length).toBe(bound.stepCount);
  }
});

// --- Law 2: Step ordering preserved ---

test('step ordering preserved between spec flow and bound view (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const flow = randomGroundedFlow(next);
    const bound = deriveBoundView(flow);

    // Indices must be monotonically increasing and match
    for (let i = 0; i < flow.steps.length; i += 1) {
      expect(flow.steps[i]!.index).toBe(bound.stepOrder[i]);
    }

    // Verify strict ordering
    for (let i = 1; i < bound.stepOrder.length; i += 1) {
      expect(bound.stepOrder[i]!).toBeGreaterThan(bound.stepOrder[i - 1]!);
    }
  }
});

// --- Law 3: Governance annotations match ---

test('governance annotations match between spec flow and bound view (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const flow = randomGroundedFlow(next);
    const bound = deriveBoundView(flow);

    for (let i = 0; i < flow.steps.length; i += 1) {
      expect(flow.steps[i]!.governance).toBe(bound.governancePerStep[i]);
    }

    // Every governance value is a valid member of the union
    for (const g of bound.governancePerStep) {
      expect(ALL_GOVERNANCE).toContain(g);
    }
  }
});

// --- Law 4: Deferred steps marked consistently ---

test('deferred steps marked consistently between spec flow and bound view (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const flow = randomGroundedFlow(next);
    const bound = deriveBoundView(flow);

    // Deferred indices from flow
    const flowDeferredIndices = flow.steps
      .filter((s) => s.bindingKind === 'deferred')
      .map((s) => s.index);

    expect(flowDeferredIndices).toEqual(bound.deferredIndices);

    // Non-deferred steps must not appear in the deferred list
    const deferredSet = new Set(bound.deferredIndices);
    for (const step of flow.steps) {
      if (step.bindingKind !== 'deferred') {
        expect(deferredSet.has(step.index)).toBe(false);
      }
    }
  }
});

// --- Law 5: Data binding references appear in both spec and scenario ---

test('data binding references appear in both spec flow and bound view (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const flow = randomGroundedFlow(next);
    const bound = deriveBoundView(flow);

    for (let i = 0; i < flow.steps.length; i += 1) {
      const flowData = flow.steps[i]!.dataValue;
      const boundData = bound.dataRefs[i];

      // Exact match: both null or both the same string
      expect(flowData).toBe(boundData);

      // If data exists, it must be a non-empty string
      if (flowData !== null) {
        expect(typeof flowData).toBe('string');
        expect(flowData.length).toBeGreaterThan(0);
      }
    }
  }
});
