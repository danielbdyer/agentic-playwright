/**
 * Parallel Step Execution — Law Tests (W3.6)
 *
 * Verifies dependency analysis, independent step detection, and
 * assertion-only filtering using synthetic BoundStep[] sequences
 * generated from mulberry32 seeds.
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomInt, pick, randomWord } from './support/random';
import {
  analyzeStepDependencies,
  findIndependentSteps,
  isAssertionOnly,
  buildParallelPlan,
} from '../lib/runtime/parallel-steps';
import type { BoundStep } from '../lib/domain/types/intent';
import type { StepAction, Confidence, Governance, StepBindingKind } from '../lib/domain/types/workflow';

// ─── Generators ───

const ACTIONS: readonly StepAction[] = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'];
const CONFIDENCES: readonly Confidence[] = ['human', 'agent-verified', 'compiler-derived', 'intent-only'];
const GOVERNANCES: readonly Governance[] = ['approved', 'review-required', 'blocked'];
const BINDING_KINDS: readonly StepBindingKind[] = ['bound', 'deferred', 'unbound'];

function randomBoundStep(next: () => number, index: number, screenPool: readonly string[]): BoundStep {
  const action = pick(next, ACTIONS);
  const screen = pick(next, screenPool);
  const element = `el-${randomWord(next)}`;
  const isAssert = action === 'assert-snapshot';
  return {
    index,
    intent: `step-${index}`,
    action_text: `do ${action}`,
    expected_text: `expect ${action}`,
    action,
    screen: screen as any,
    element: element as any,
    confidence: pick(next, CONFIDENCES),
    binding: {
      kind: pick(next, BINDING_KINDS),
      reasons: [],
      ruleId: null,
      normalizedIntent: `step-${index}`,
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance: pick(next, GOVERNANCES),
      reviewReasons: [],
    },
    program: isAssert
      ? { kind: 'step-program' as const, instructions: [{ kind: 'observe-structure' as const, screen: screen as any, element: element as any, snapshotTemplate: 'tpl' as any }] }
      : next() > 0.7
        ? { kind: 'step-program' as const, instructions: [{ kind: 'invoke' as const, screen: screen as any, element: element as any, action: 'click' as const }] }
        : undefined,
  };
}

function randomAssertionStep(next: () => number, index: number, screen: string): BoundStep {
  const element = `assert-el-${randomWord(next)}`;
  return {
    index,
    intent: `assert-${index}`,
    action_text: `verify snapshot`,
    expected_text: `snapshot matches`,
    action: 'assert-snapshot',
    screen: screen as any,
    element: element as any,
    confidence: 'compiler-derived',
    binding: {
      kind: 'bound',
      reasons: [],
      ruleId: null,
      normalizedIntent: `assert-${index}`,
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance: 'approved',
      reviewReasons: [],
    },
    program: { kind: 'step-program' as const, instructions: [{ kind: 'observe-structure' as const, screen: screen as any, element: element as any, snapshotTemplate: 'tpl' as any }] },
  };
}

function randomMutatingStep(next: () => number, index: number, screen: string): BoundStep {
  const action = pick(next, ['navigate', 'input', 'click'] as const);
  const element = `mut-el-${randomWord(next)}`;
  return {
    index,
    intent: `mutate-${index}`,
    action_text: `do ${action}`,
    expected_text: `expect ${action}`,
    action,
    screen: screen as any,
    element: element as any,
    confidence: 'compiler-derived',
    binding: {
      kind: 'bound',
      reasons: [],
      ruleId: null,
      normalizedIntent: `mutate-${index}`,
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance: 'approved',
      reviewReasons: [],
    },
  };
}

function randomStepSequence(next: () => number): readonly BoundStep[] {
  const screenCount = 1 + randomInt(next, 4);
  const screens = Array.from({ length: screenCount }, () => `screen-${randomWord(next)}`);
  const stepCount = 3 + randomInt(next, 10);
  return Array.from({ length: stepCount }, (_, i) => randomBoundStep(next, i, screens));
}

// ─── Law 1: isAssertionOnly classification (150 seeds) ───

test.describe('isAssertionOnly classification', () => {
  test('assert-snapshot steps with observe-structure programs are assertion-only (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screen = `scr-${randomWord(next)}`;
      const step = randomAssertionStep(next, 0, screen);
      expect(isAssertionOnly(step)).toBe(true);
    }
  });

  test('mutating steps are never assertion-only (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screen = `scr-${randomWord(next)}`;
      const step = randomMutatingStep(next, 0, screen);
      expect(isAssertionOnly(step)).toBe(false);
    }
  });
});

// ─── Law 2: Dependency map completeness (150 seeds) ───

test.describe('dependency map completeness', () => {
  test('every step index has an entry in the dependency map (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const steps = randomStepSequence(next);
      const deps = analyzeStepDependencies(steps);

      for (let i = 0; i < steps.length; i++) {
        expect(deps.has(i)).toBe(true);
      }
      expect(deps.size).toBe(steps.length);
    }
  });
});

// ─── Law 3: First step has no dependencies (150 seeds) ───

test.describe('first step independence', () => {
  test('step 0 always has empty dependency list (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const steps = randomStepSequence(next);
      const deps = analyzeStepDependencies(steps);

      expect(deps.get(0)).toEqual([]);
    }
  });
});

// ─── Law 4: Dependencies are acyclic and backward-looking (150 seeds) ───

test.describe('dependency acyclicity', () => {
  test('all dependencies point to earlier steps (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const steps = randomStepSequence(next);
      const deps = analyzeStepDependencies(steps);

      for (const [idx, depList] of deps.entries()) {
        for (const dep of depList) {
          expect(dep).toBeLessThan(idx);
        }
      }
    }
  });
});

// ─── Law 5: Independent groups cover all steps (150 seeds) ───

test.describe('independent group coverage', () => {
  test('flattened groups contain every step index exactly once (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const steps = randomStepSequence(next);
      const deps = analyzeStepDependencies(steps);
      const groups = findIndependentSteps(deps);

      const allIndices = groups.flat().sort((a, b) => a - b);
      const expected = Array.from({ length: steps.length }, (_, i) => i);
      expect(allIndices).toEqual(expected);
    }
  });
});

// ─── Law 6: Group ordering respects dependencies (150 seeds) ───

test.describe('group ordering respects dependencies', () => {
  test('if step A depends on step B, A is in a later group (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const steps = randomStepSequence(next);
      const deps = analyzeStepDependencies(steps);
      const groups = findIndependentSteps(deps);

      // Build index → group map
      const groupOf = new Map<number, number>();
      groups.forEach((group, gi) => group.forEach((idx) => groupOf.set(idx, gi)));

      for (const [idx, depList] of deps.entries()) {
        for (const dep of depList) {
          expect(groupOf.get(idx)!).toBeGreaterThan(groupOf.get(dep)!);
        }
      }
    }
  });
});

// ─── Law 7: Assertion-only steps on different screens are independent (150 seeds) ───

test.describe('assertion-only cross-screen independence', () => {
  test('consecutive assertion-only steps on different screens have no mutual deps (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screenA = `screen-a-${randomWord(next)}`;
      const screenB = `screen-b-${randomWord(next)}`;

      const steps: readonly BoundStep[] = [
        randomAssertionStep(next, 0, screenA),
        randomAssertionStep(next, 1, screenB),
        randomAssertionStep(next, 2, screenA),
        randomAssertionStep(next, 3, screenB),
      ];

      const deps = analyzeStepDependencies(steps);
      const groups = findIndependentSteps(deps);

      // All assertion-only steps with no preceding mutating steps should be in group 0
      expect(groups[0]!.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ─── Law 8: Mutating step creates barrier (150 seeds) ───

test.describe('mutating step barrier', () => {
  test('steps after a mutating step on the same screen depend on it (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screen = `screen-${randomWord(next)}`;

      const steps: readonly BoundStep[] = [
        randomAssertionStep(next, 0, screen),
        randomMutatingStep(next, 1, screen),
        randomAssertionStep(next, 2, screen),
      ];

      const deps = analyzeStepDependencies(steps);

      // Step 2 must depend on step 1 (the mutating step on the same screen)
      expect(deps.get(2)).toContain(1);
    }
  });
});

// ─── Law 9: Empty step list (150 seeds) ───

test.describe('empty step list', () => {
  test('empty input produces empty dependency map and groups (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const deps = analyzeStepDependencies([]);
      expect(deps.size).toBe(0);

      const groups = findIndependentSteps(deps);
      expect(groups.length).toBe(0);
    }
  });
});

// ─── Law 10: buildParallelPlan marks assertion-only groups correctly (150 seeds) ───

test.describe('buildParallelPlan assertion-only marking', () => {
  test('groups of purely assertion-only steps are marked allAssertionOnly (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screenA = `screen-a-${randomWord(next)}`;
      const screenB = `screen-b-${randomWord(next)}`;

      // Build a sequence: 2 assertions (different screens) → mutating → 2 assertions
      const steps: readonly BoundStep[] = [
        randomAssertionStep(next, 0, screenA),
        randomAssertionStep(next, 1, screenB),
        randomMutatingStep(next, 2, screenA),
        randomAssertionStep(next, 3, screenA),
        randomAssertionStep(next, 4, screenB),
      ];

      const deps = analyzeStepDependencies(steps);
      const groups = findIndependentSteps(deps);
      const plan = buildParallelPlan(steps, groups);

      // First group should be assertion-only (steps 0,1)
      const firstGroup = plan[0]!;
      if (firstGroup.stepIndices.every((idx) => isAssertionOnly(steps[idx]!))) {
        expect(firstGroup.allAssertionOnly).toBe(true);
      }

      // Groups containing the mutating step should NOT be allAssertionOnly
      for (const group of plan) {
        if (group.stepIndices.includes(2)) {
          expect(group.allAssertionOnly).toBe(false);
        }
      }
    }
  });
});

// ─── Law 11: Single step (150 seeds) ───

test.describe('single step', () => {
  test('single step produces one group with one step (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);
      const screen = `scr-${randomWord(next)}`;
      const steps: readonly BoundStep[] = [randomBoundStep(next, 0, [screen])];

      const deps = analyzeStepDependencies(steps);
      const groups = findIndependentSteps(deps);

      expect(groups.length).toBe(1);
      expect(groups[0]).toEqual([0]);
    }
  });
});

// ─── Law 12: Determinism — same seed produces same result (150 seeds) ───

test.describe('determinism', () => {
  test('same seed produces identical dependency map and groups (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const steps1 = randomStepSequence(mulberry32(seed));
      const steps2 = randomStepSequence(mulberry32(seed));

      const deps1 = analyzeStepDependencies(steps1);
      const deps2 = analyzeStepDependencies(steps2);

      const groups1 = findIndependentSteps(deps1);
      const groups2 = findIndependentSteps(deps2);

      expect([...deps1.entries()]).toEqual([...deps2.entries()]);
      expect(groups1).toEqual(groups2);
    }
  });
});
