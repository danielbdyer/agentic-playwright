/**
 * Entropy Injection — Law Tests (W3.10)
 *
 * Verifies the deterministic variant generation system:
 *
 *   1. Determinism: same seed always produces identical variants
 *   2. Variant count: output size matches profile dimensions
 *   3. Mutation coverage: all applicable mutation kinds appear
 *   4. Variant identity: every variant carries correct base scenario ID
 *   5. Mutation field provenance: mutation fields reference valid step indices
 *   6. Profile scaling: zero-profile produces zero variants
 *   7. Seed sensitivity: different seeds produce different variants
 *   8. Default profile well-formedness: all dimensions are positive
 *
 * 150 seeds, law-style.
 */

import { expect, test } from '@playwright/test';
import {
  generateVariants,
  defaultVarianceProfile,
  computeVariantCount,
} from '../lib/application/entropy-injection';
import type {
  ScenarioSeed,
  ScenarioSeedStep,
  VarianceProfile,
} from '../lib/application/entropy-injection';
import { mulberry32, pick, randomInt } from './support/random';

// ─── Helpers ───

const SEEDS = 150;

const ACTIONS = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;

const INTENTS_WITH_VERBS = [
  'Click the submit button',
  'Enter the user name',
  'Navigate to the dashboard',
  'Verify the total amount',
  'Select the dropdown option',
  'Delete the record',
  'Search for the item',
  'Submit the form',
] as const;

const INTENTS_WITHOUT_VERBS = [
  'Observe the result',
  'Wait for loading',
  'Scroll down',
] as const;

function randomStep(next: () => number, index: number): ScenarioSeedStep {
  const hasVerb = next() > 0.3;
  const intent = hasVerb
    ? pick(next, INTENTS_WITH_VERBS)
    : pick(next, INTENTS_WITHOUT_VERBS);
  const action = pick(next, ACTIONS);
  const hasScreen = next() > 0.3;
  const hasElement = next() > 0.4;
  const hasData = next() > 0.5;

  return {
    index,
    intent,
    action,
    screen: hasScreen ? `screen-${randomInt(next, 5)}` : null,
    element: hasElement ? pick(next, ['name-field', 'email-input', 'phone-number', 'date-picker', 'submit-btn']) : null,
    dataValue: hasData ? pick(next, ['John', 'test@example.com', '555-1234', '2025-01-01', '42']) : null,
  };
}

function randomScenario(next: () => number): ScenarioSeed {
  const stepCount = 1 + randomInt(next, 6);
  return {
    id: `scenario-${randomInt(next, 1000)}`,
    title: `Test Scenario ${randomInt(next, 100)}`,
    steps: Array.from({ length: stepCount }, (_, i) => randomStep(next, i)),
  };
}

function _randomProfile(next: () => number): VarianceProfile {
  return {
    adoPhrasingVariants: randomInt(next, 5),
    dataPostureCombinations: randomInt(next, 4),
    screenStatePermutations: randomInt(next, 4),
    navigationPathVariants: randomInt(next, 3),
  };
}

// ─── Law 1: Determinism — same seed always produces identical variants ───

test.describe('Law 1: Determinism — same seed produces identical output', () => {
  test('generateVariants is deterministic across 150 seeds', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const result1 = generateVariants(scenario, profile, seed);
      const result2 = generateVariants(scenario, profile, seed);

      expect(result1).toEqual(result2);
    }
  });

  test('variant IDs are stable across calls', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const ids1 = generateVariants(scenario, profile, seed).map((v) => v.variantId);
      const ids2 = generateVariants(scenario, profile, seed).map((v) => v.variantId);

      expect(ids1).toEqual(ids2);
    }
  });
});

// ─── Law 2: Variant count consistency ───

test.describe('Law 2: Variant count — output size is bounded by profile', () => {
  test('variant count never exceeds computeVariantCount across 150 seeds', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const variants = generateVariants(scenario, profile, seed);
      const expectedMax = computeVariantCount(scenario, profile);

      // Each variant carries at least one mutation; total mutations <= expectedMax
      const totalMutations = variants.reduce((sum, v) => sum + v.mutations.length, 0);
      expect(totalMutations).toBeLessThanOrEqual(expectedMax);
    }
  });

  test('no variants produced when scenario has zero applicable steps', () => {
    const emptyScenario: ScenarioSeed = {
      id: 'empty-scenario',
      title: 'No steps',
      steps: [],
    };

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const variants = generateVariants(emptyScenario, defaultVarianceProfile(), seed);
      expect(variants).toHaveLength(0);
    }
  });
});

// ─── Law 3: Mutation coverage — all applicable kinds appear ───

test.describe('Law 3: Mutation coverage — applicable dimensions produce mutations', () => {
  test('phrasing mutations appear when step intent contains known verbs', () => {
    const scenario: ScenarioSeed = {
      id: 'phrasing-test',
      title: 'Phrasing coverage',
      steps: [{
        index: 0,
        intent: 'Click the submit button',
        action: 'click',
        screen: 'dashboard',
        element: 'submit-btn',
        dataValue: null,
      }],
    };

    const profile = defaultVarianceProfile();
    const variants = generateVariants(scenario, profile, 42);
    const phrasingMutations = variants.flatMap((v) =>
      v.mutations.filter((m) => m.kind === 'phrasing'),
    );
    expect(phrasingMutations.length).toBeGreaterThan(0);
  });

  test('data mutations appear when step has dataValue', () => {
    const scenario: ScenarioSeed = {
      id: 'data-test',
      title: 'Data coverage',
      steps: [{
        index: 0,
        intent: 'Enter the email address',
        action: 'input',
        screen: 'login',
        element: 'email-input',
        dataValue: 'user@test.com',
      }],
    };

    const profile = defaultVarianceProfile();
    const variants = generateVariants(scenario, profile, 42);
    const dataMutations = variants.flatMap((v) =>
      v.mutations.filter((m) => m.kind === 'data'),
    );
    expect(dataMutations.length).toBeGreaterThan(0);
  });

  test('state mutations appear when step has a screen', () => {
    const scenario: ScenarioSeed = {
      id: 'state-test',
      title: 'State coverage',
      steps: [{
        index: 0,
        intent: 'Observe the result',
        action: 'custom',
        screen: 'results-page',
        element: null,
        dataValue: null,
      }],
    };

    const profile = defaultVarianceProfile();
    const variants = generateVariants(scenario, profile, 42);
    const stateMutations = variants.flatMap((v) =>
      v.mutations.filter((m) => m.kind === 'state'),
    );
    expect(stateMutations.length).toBeGreaterThan(0);
  });

  test('navigation mutations appear when step is navigate with screen', () => {
    const scenario: ScenarioSeed = {
      id: 'nav-test',
      title: 'Navigation coverage',
      steps: [{
        index: 0,
        intent: 'Navigate to the settings page',
        action: 'navigate',
        screen: 'settings',
        element: null,
        dataValue: null,
      }],
    };

    const profile = defaultVarianceProfile();
    const variants = generateVariants(scenario, profile, 42);
    const navMutations = variants.flatMap((v) =>
      v.mutations.filter((m) => m.kind === 'navigation'),
    );
    expect(navMutations.length).toBeGreaterThan(0);
  });
});

// ─── Law 4: Variant identity — every variant carries correct base ID ───

test.describe('Law 4: Variant identity — base scenario ID preserved', () => {
  test('all variants reference the base scenario ID across 150 seeds', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const variants = generateVariants(scenario, profile, seed);
      variants.forEach((v) => {
        expect(v.baseScenarioId).toBe(scenario.id);
      });
    }
  });

  test('variant IDs are prefixed with base scenario ID', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const variants = generateVariants(scenario, profile, seed);
      variants.forEach((v) => {
        expect(v.variantId.startsWith(scenario.id)).toBe(true);
      });
    }
  });

  test('variant IDs are unique within a generation', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const variants = generateVariants(scenario, profile, seed);
      const ids = variants.map((v) => v.variantId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ─── Law 5: Mutation field provenance ───

test.describe('Law 5: Mutation field provenance — fields reference valid steps', () => {
  test('mutation fields reference step indices within scenario bounds', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const profile = defaultVarianceProfile();

      const variants = generateVariants(scenario, profile, seed);
      const maxIndex = scenario.steps.length - 1;

      variants.forEach((v) => {
        v.mutations.forEach((m) => {
          const indexMatch = m.field.match(/steps\[(\d+)\]/);
          expect(indexMatch).not.toBeNull();
          const stepIndex = parseInt(indexMatch![1] as string, 10);
          expect(stepIndex).toBeGreaterThanOrEqual(0);
          expect(stepIndex).toBeLessThanOrEqual(maxIndex);
        });
      });
    }
  });
});

// ─── Law 6: Profile scaling — zero profile produces zero variants ───

test.describe('Law 6: Profile scaling — zero dimensions yield zero output', () => {
  test('zero-profile produces no variants across 150 seeds', () => {
    const zeroProfile: VarianceProfile = {
      adoPhrasingVariants: 0,
      dataPostureCombinations: 0,
      screenStatePermutations: 0,
      navigationPathVariants: 0,
    };

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      const variants = generateVariants(scenario, zeroProfile, seed);
      expect(variants).toHaveLength(0);
    }
  });

  test('computeVariantCount returns 0 for zero profile', () => {
    const zeroProfile: VarianceProfile = {
      adoPhrasingVariants: 0,
      dataPostureCombinations: 0,
      screenStatePermutations: 0,
      navigationPathVariants: 0,
    };

    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const scenario = randomScenario(next);
      expect(computeVariantCount(scenario, zeroProfile)).toBe(0);
    }
  });
});

// ─── Law 7: Seed sensitivity — different seeds produce different variants ───

test.describe('Law 7: Seed sensitivity — different seeds diverge', () => {
  test('at least some seeds produce different variant sets for a fixed scenario', () => {
    const scenario: ScenarioSeed = {
      id: 'sensitivity-test',
      title: 'Seed sensitivity',
      steps: [
        {
          index: 0,
          intent: 'Click the submit button',
          action: 'click',
          screen: 'form-page',
          element: 'name-field',
          dataValue: 'Alice',
        },
        {
          index: 1,
          intent: 'Enter the email address',
          action: 'input',
          screen: 'form-page',
          element: 'email-input',
          dataValue: 'a@b.com',
        },
        {
          index: 2,
          intent: 'Navigate to the results page',
          action: 'navigate',
          screen: 'results',
          element: null,
          dataValue: null,
        },
      ],
    };

    const profile = defaultVarianceProfile();
    const baseline = JSON.stringify(generateVariants(scenario, profile, 1));
    let diverged = false;

    for (let seed = 2; seed <= SEEDS; seed += 1) {
      const current = JSON.stringify(generateVariants(scenario, profile, seed));
      if (current !== baseline) {
        diverged = true;
        break;
      }
    }

    expect(diverged).toBe(true);
  });
});

// ─── Law 8: Default profile well-formedness ───

test.describe('Law 8: Default profile — all dimensions positive', () => {
  test('defaultVarianceProfile has all positive dimensions', () => {
    const profile = defaultVarianceProfile();
    expect(profile.adoPhrasingVariants).toBeGreaterThan(0);
    expect(profile.dataPostureCombinations).toBeGreaterThan(0);
    expect(profile.screenStatePermutations).toBeGreaterThan(0);
    expect(profile.navigationPathVariants).toBeGreaterThan(0);
  });

  test('defaultVarianceProfile is pure — returns equal objects', () => {
    const p1 = defaultVarianceProfile();
    const p2 = defaultVarianceProfile();
    expect(p1).toEqual(p2);
  });
});
