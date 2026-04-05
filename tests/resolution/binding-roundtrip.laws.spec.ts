/**
 * W2.20 — Round-Trip Binding Law Tests
 *
 * Laws verified:
 * 1. unbind(bind(step)) ~ step — binding preserves essential structure
 * 2. Binding is idempotent: bind(bind(step)) has same binding result
 * 3. Governance is preserved through binding
 * 4. Tests with various step types: navigate, input, click, assert-snapshot
 */

import { expect, test } from '@playwright/test';
import { bindScenarioStep, type StepBindingContext } from '../../lib/domain/governance/binding';
import {
  createElementId,
  createPostureId,
  createScreenId,
  createSnapshotTemplateId,
  createSurfaceId,
} from '../../lib/domain/kernel/identity';
import type { BoundStep, ScenarioStep } from '../../lib/domain/intent/types';
import type { ScreenElements, ScreenPostures, SurfaceGraph } from '../../lib/domain/knowledge/types';
import { mulberry32, pick, randomWord , LAW_SEED_COUNT } from '../support/random';

// ─── Factories ───

const SCREEN_ID = createScreenId('test-screen');
const ELEMENT_ID = createElementId('testInput');
const POSTURE_ID = createPostureId('valid');
const SURFACE_ID = createSurfaceId('test-form');
const SNAPSHOT_TEMPLATE = createSnapshotTemplateId('snapshots/test-screen/results.yaml');

function createSurfaceGraph(): SurfaceGraph {
  return {
    screen: SCREEN_ID,
    url: 'https://app.test/test-screen',
    sections: {
      main: {
        selector: '[data-screen="test-screen"]',
        kind: 'form',
        surfaces: [SURFACE_ID],
      },
    },
    surfaces: {
      'test-form': {
        kind: 'form',
        section: 'main' as any,
        selector: 'form',
        parents: [],
        children: [],
        elements: [ELEMENT_ID],
        assertions: [],
      },
    },
  };
}

function createScreenElements(): ScreenElements {
  return {
    screen: SCREEN_ID,
    url: '/test-page',
    elements: {
      testInput: {
        role: 'textbox',
        name: 'Test Input',
        widget: 'text-input' as any,
        surface: SURFACE_ID,
        required: true,
        locator: [{ kind: 'test-id', value: 'test-input' }],
      },
    },
  };
}

function createScreenPostures(): ScreenPostures {
  return {
    screen: SCREEN_ID,
    postures: {
      testInput: {
        valid: {
          values: ['test-value'],
          effects: [],
        },
      },
    },
  };
}

function fullContext(): StepBindingContext {
  return {
    screenElements: createScreenElements(),
    screenPostures: createScreenPostures(),
    surfaceGraph: createSurfaceGraph(),
    availableSnapshotTemplates: new Set([SNAPSHOT_TEMPLATE]),
  };
}

function navigateStep(overrides?: Partial<ScenarioStep>): ScenarioStep {
  return {
    index: 0,
    intent: 'Navigate to the test page',
    action_text: 'Navigate to the test page',
    expected_text: '',
    action: 'navigate',
    screen: SCREEN_ID,
    element: null,
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: { action: 'navigate', screen: SCREEN_ID },
    confidence: 'human',
    ...overrides,
  };
}

function inputStep(overrides?: Partial<ScenarioStep>): ScenarioStep {
  return {
    index: 1,
    intent: 'Enter a value into test input',
    action_text: 'Enter a value into test input',
    expected_text: 'Value accepted',
    action: 'input',
    screen: SCREEN_ID,
    element: ELEMENT_ID,
    posture: POSTURE_ID,
    override: null,
    snapshot_template: null,
    resolution: {
      action: 'input',
      screen: SCREEN_ID,
      element: ELEMENT_ID,
      posture: POSTURE_ID,
    },
    confidence: 'human',
    ...overrides,
  };
}

function clickStep(overrides?: Partial<ScenarioStep>): ScenarioStep {
  return {
    index: 2,
    intent: 'Click the submit button',
    action_text: 'Click the submit button',
    expected_text: 'Form submitted',
    action: 'click',
    screen: SCREEN_ID,
    element: ELEMENT_ID,
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: {
      action: 'click',
      screen: SCREEN_ID,
      element: ELEMENT_ID,
    },
    confidence: 'human',
    ...overrides,
  };
}

function assertSnapshotStep(overrides?: Partial<ScenarioStep>): ScenarioStep {
  return {
    index: 3,
    intent: 'Verify results display',
    action_text: 'Verify results display',
    expected_text: 'Results match snapshot',
    action: 'assert-snapshot',
    screen: SCREEN_ID,
    element: ELEMENT_ID,
    posture: null,
    override: null,
    snapshot_template: SNAPSHOT_TEMPLATE,
    resolution: {
      action: 'assert-snapshot',
      screen: SCREEN_ID,
      element: ELEMENT_ID,
      snapshot_template: SNAPSHOT_TEMPLATE,
    },
    confidence: 'human',
    ...overrides,
  };
}

/** Extract the essential scenario-step fields from a bound step (strip binding metadata). */
function unbind(bound: BoundStep): ScenarioStep {
  return {
    index: bound.index,
    intent: bound.intent,
    action_text: bound.action_text,
    expected_text: bound.expected_text,
    action: bound.action,
    screen: bound.screen,
    element: bound.element,
    posture: bound.posture,
    override: bound.override,
    snapshot_template: bound.snapshot_template,
    resolution: bound.resolution,
    confidence: bound.confidence,
  };
}

// ─── Law 1: unbind(bind(step)) ~ step ───

test.describe('Binding round-trip: structure preservation', () => {
  const stepFactories = [
    { name: 'navigate', factory: navigateStep },
    { name: 'input', factory: inputStep },
    { name: 'click', factory: clickStep },
    { name: 'assert-snapshot', factory: assertSnapshotStep },
  ] as const;

  for (const { name, factory } of stepFactories) {
    test(`unbind(bind(${name})) preserves essential fields`, () => {
      const step = factory();
      const bound = bindScenarioStep(step, fullContext());
      const roundTripped = unbind(bound);

      // Core fields must survive the round-trip. Confidence may be canonicalized
      // (intent-only -> human) by binding logic, so we check structural identity.
      expect(roundTripped.index).toBe(step.index);
      expect(roundTripped.intent).toBe(step.intent);
      expect(roundTripped.action_text).toBe(step.action_text);
      expect(roundTripped.expected_text).toBe(step.expected_text);
      expect(roundTripped.action).toBe(step.action);
      expect(roundTripped.screen).toBe(step.screen);
      expect(roundTripped.element).toBe(step.element);
      expect(roundTripped.posture).toBe(step.posture);
      expect(roundTripped.override).toBe(step.override);
      expect(roundTripped.snapshot_template).toBe(step.snapshot_template);
      expect(roundTripped.resolution).toEqual(step.resolution);
    });
  }

  test('round-trip preserves structure for intent-only steps (no resolution)', () => {
    const step: ScenarioStep = {
      index: 0,
      intent: 'Do something novel',
      action_text: 'Do something novel',
      expected_text: 'Something happened',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'intent-only',
    };

    const bound = bindScenarioStep(step, {});
    const roundTripped = unbind(bound);

    expect(roundTripped.index).toBe(step.index);
    expect(roundTripped.action).toBe(step.action);
    expect(roundTripped.screen).toBe(step.screen);
    expect(roundTripped.element).toBe(step.element);
    expect(roundTripped.resolution).toBe(step.resolution);
  });
});

// ─── Law 2: Binding idempotence ───

test.describe('Binding round-trip: idempotence', () => {
  test('binding the same step twice produces identical binding results', () => {
    for (const factory of [navigateStep, inputStep, clickStep, assertSnapshotStep]) {
      const step = factory();
      const ctx = fullContext();
      const bound1 = bindScenarioStep(step, ctx);
      const bound2 = bindScenarioStep(step, ctx);

      expect(bound1.binding.kind).toBe(bound2.binding.kind);
      expect(bound1.binding.reasons).toEqual(bound2.binding.reasons);
      expect(bound1.binding.governance).toBe(bound2.binding.governance);
      expect(bound1.binding.normalizedIntent).toBe(bound2.binding.normalizedIntent);
    }
  });

  test('binding is deterministic across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const actions: ReadonlyArray<'navigate' | 'input' | 'click' | 'assert-snapshot'> = ['navigate', 'input', 'click', 'assert-snapshot'];
      const action = pick(next, actions);

      const factoryMap: Record<string, () => ScenarioStep> = {
        navigate: navigateStep,
        input: inputStep,
        click: clickStep,
        'assert-snapshot': assertSnapshotStep,
      };
      const step = factoryMap[action]!();
      const ctx = fullContext();

      const result1 = bindScenarioStep(step, ctx);
      const result2 = bindScenarioStep(step, ctx);

      expect(result1.binding.kind).toBe(result2.binding.kind);
      expect(result1.binding.governance).toBe(result2.binding.governance);
      expect(result1.binding.reasons).toEqual(result2.binding.reasons);
    }
  });
});

// ─── Law 3: Governance preservation ───

test.describe('Binding round-trip: governance preservation', () => {
  test('bound steps with no issues get approved governance', () => {
    const step = inputStep();
    const bound = bindScenarioStep(step, fullContext());
    expect(bound.binding.kind).toBe('bound');
    expect(bound.binding.governance).toBe('approved');
  });

  test('unbound steps get blocked governance', () => {
    const step = inputStep({ element: createElementId('nonExistentElement') });
    const bound = bindScenarioStep(step, fullContext());
    expect(bound.binding.kind).toBe('unbound');
    expect(bound.binding.governance).toBe('blocked');
  });

  test('agent-proposed steps get review-required governance even when bound', () => {
    const step = navigateStep({ confidence: 'agent-proposed' });
    const bound = bindScenarioStep(step, fullContext());
    expect(bound.binding.governance).toBe('review-required');
  });

  test('agent-verified steps get review-required governance', () => {
    const step = navigateStep({ confidence: 'agent-verified' });
    const bound = bindScenarioStep(step, fullContext());
    expect(bound.binding.governance).toBe('review-required');
  });

  test('deferred steps (no explicit resolution) get approved governance for human confidence', () => {
    const step: ScenarioStep = {
      index: 0,
      intent: 'Do something',
      action_text: 'Do something',
      expected_text: '',
      action: 'custom',
      screen: null,
      element: null,
      posture: null,
      override: null,
      snapshot_template: null,
      resolution: null,
      confidence: 'human',
    };

    const bound = bindScenarioStep(step, {});
    expect(bound.binding.kind).toBe('deferred');
    expect(bound.binding.governance).toBe('approved');
  });

  test('governance monotonicity: unbound implies blocked, never demotes to approved', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const confidences: ReadonlyArray<ScenarioStep['confidence']> = ['human', 'agent-verified', 'agent-proposed', 'compiler-derived', 'intent-only'];
      const confidence = pick(next, confidences);

      // Deliberately create a step with a missing element to trigger unbound
      const step = inputStep({
        confidence,
        element: createElementId(`missing-${randomWord(next)}`),
      });

      const bound = bindScenarioStep(step, fullContext());

      if (bound.binding.kind === 'unbound') {
        expect(bound.binding.governance).toBe('blocked');
      }
    }
  });
});

// ─── Law 4: Missing context produces unbound with reasons ───

test.describe('Binding round-trip: missing context produces reasons', () => {
  test('missing screen context produces unknown-screen reason', () => {
    const step = inputStep();
    const bound = bindScenarioStep(step, { surfaceGraph: createSurfaceGraph() });
    expect(bound.binding.reasons).toContain('unknown-screen');
  });

  test('missing surface graph produces missing-surface-graph reason', () => {
    const step = inputStep();
    const bound = bindScenarioStep(step, { screenElements: createScreenElements() });
    expect(bound.binding.reasons).toContain('missing-surface-graph');
  });

  test('missing snapshot template produces missing-snapshot-template reason', () => {
    const step = assertSnapshotStep();
    const bound = bindScenarioStep(step, {
      ...fullContext(),
      availableSnapshotTemplates: new Set(),
    });
    expect(bound.binding.reasons).toContain('missing-snapshot-template');
  });

  test('unknown element produces unknown-element reason', () => {
    const step = inputStep({ element: createElementId('doesNotExist') });
    const bound = bindScenarioStep(step, fullContext());
    expect(bound.binding.reasons).toContain('unknown-element');
  });
});
