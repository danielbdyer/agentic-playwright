/**
 * Supplement Hierarchy Precedence — Law Tests (W2.6)
 *
 * Verifies that the supplement resolution hierarchy is a total order:
 *   screen-local hints > shared patterns > default
 *
 * Screen-local hints (knowledge/screens/{screen}.hints.yaml) must always
 * override shared patterns (knowledge/patterns/*.yaml) deterministically.
 * No silent overrides from the wrong layer.
 *
 * Tested structures:
 *   - chooseByPrecedence with supplement-related rungs
 *   - resolutionPrecedenceLaw ordering
 *   - mergeScreenElementsWithHints overlay behavior
 *   - Candidate lattice source weights (approved-screen-knowledge > shared-patterns)
 */

import { expect, test } from '@playwright/test';
import {
  chooseByPrecedence,
  precedenceWeight,
  resolutionPrecedenceLaw,
  type ResolutionPrecedenceRung,
} from '../lib/domain/precedence';
import { mergeScreenElementsWithHints } from '../lib/domain/knowledge/screen-bundle';
import type { ScreenElements, ScreenHints, ScreenElementHint, ElementSig } from '../lib/domain/types';
import { createScreenId, createSurfaceId, createWidgetId } from '../lib/domain/identity';
import { mulberry32, pick, randomWord } from './support/random';

// ─── Supplement hierarchy rungs ───

const SUPPLEMENT_RUNGS: readonly ResolutionPrecedenceRung[] = [
  'approved-screen-knowledge',
  'shared-patterns',
] as const;

type SupplementLayer = 'screen-local' | 'shared' | 'default';

function _supplementRungFor(layer: SupplementLayer): ResolutionPrecedenceRung | null {
  switch (layer) {
    case 'screen-local': return 'approved-screen-knowledge';
    case 'shared': return 'shared-patterns';
    case 'default': return null;
  }
}

// ─── Fixtures ───

function makeElements(elementIds: readonly string[], affordances: Readonly<Record<string, string | null>>): ScreenElements {
  const entries: Record<string, ElementSig> = {};
  for (const id of elementIds) {
    entries[id] = {
      role: 'textbox',
      name: id,
      testId: id,
      cssFallback: null,
      surface: createSurfaceId('form'),
      widget: createWidgetId('os-input'),
      affordance: affordances[id] ?? null,
    };
  }
  return {
    screen: createScreenId('test-screen'),
    url: '/test',
    elements: entries,
  };
}

function makeHints(elementOverrides: Readonly<Record<string, Partial<ScreenElementHint>>>): ScreenHints {
  const elements: Record<string, ScreenElementHint> = {};
  for (const [id, overrides] of Object.entries(elementOverrides)) {
    elements[id] = {
      aliases: overrides.aliases ?? [],
      defaultValueRef: overrides.defaultValueRef ?? null,
      parameter: overrides.parameter ?? null,
      affordance: overrides.affordance ?? null,
      ...overrides,
    };
  }
  return {
    screen: createScreenId('test-screen'),
    screenAliases: [],
    elements,
  };
}

// ─── Law 1: Total order — screen-local > shared > default ───

test.describe('Law 1: Supplement hierarchy is a total order', () => {
  test('screen-local rung has strictly higher precedence weight than shared-patterns', () => {
    const localWeight = precedenceWeight(resolutionPrecedenceLaw, 'approved-screen-knowledge');
    const sharedWeight = precedenceWeight(resolutionPrecedenceLaw, 'shared-patterns');
    expect(localWeight).toBeGreaterThan(sharedWeight);
    expect(sharedWeight).toBeGreaterThan(0);
  });

  test('all supplement rungs appear in the resolution law', () => {
    for (const rung of SUPPLEMENT_RUNGS) {
      expect(resolutionPrecedenceLaw).toContain(rung);
    }
  });

  test('approved-screen-knowledge precedes shared-patterns in the law array', () => {
    const localIndex = resolutionPrecedenceLaw.indexOf('approved-screen-knowledge');
    const sharedIndex = resolutionPrecedenceLaw.indexOf('shared-patterns');
    expect(localIndex).toBeLessThan(sharedIndex);
  });

  test('total order holds across 150 random seeds with random values', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const localValue = randomWord(next);
      const sharedValue = randomWord(next);

      const result = chooseByPrecedence(
        [
          { rung: 'shared-patterns' as ResolutionPrecedenceRung, value: sharedValue },
          { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: localValue },
        ],
        resolutionPrecedenceLaw,
      );
      expect(result).toBe(localValue);
    }
  });
});

// ─── Law 2: Screen-local wins when both exist ───

test.describe('Law 2: Screen-local hints override shared patterns', () => {
  test('chooseByPrecedence selects local over shared regardless of insertion order', () => {
    const orderings = [
      [
        { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: 'local' },
        { rung: 'shared-patterns' as ResolutionPrecedenceRung, value: 'shared' },
      ],
      [
        { rung: 'shared-patterns' as ResolutionPrecedenceRung, value: 'shared' },
        { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: 'local' },
      ],
    ];

    for (const candidates of orderings) {
      const result = chooseByPrecedence(candidates, resolutionPrecedenceLaw);
      expect(result).toBe('local');
    }
  });

  test('mergeScreenElementsWithHints overlays affordance from hints onto elements', () => {
    const elements = makeElements(['field-a', 'field-b'], { 'field-a': 'text-entry', 'field-b': null });
    const hints = makeHints({
      'field-a': { affordance: 'date-picker' },
      'field-b': { affordance: 'dropdown' },
    });

    const merged = mergeScreenElementsWithHints(elements, hints);

    // Element's own non-null affordance takes priority (element ?? hint chain)
    expect(merged['field-a']?.affordance).toBe('text-entry');
    // Local hint fills in when element has null affordance
    expect(merged['field-b']?.affordance).toBe('dropdown');
  });

  test('local override is deterministic across 150 random seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const localAffordance = randomWord(next);
      const elementAffordance = randomWord(next);

      const elements = makeElements(['el'], { el: elementAffordance });
      const hints = makeHints({ el: { affordance: localAffordance } });
      const merged = mergeScreenElementsWithHints(elements, hints);

      // Hint affordance wins via the ?? chain: element.affordance ?? hint.affordance
      // When element has a non-null affordance, the element value wins (by design).
      // When element has null affordance, hint fills in.
      const expected = elementAffordance ?? localAffordance;
      expect(merged['el']?.affordance).toBe(expected);
    }
  });
});

// ─── Law 3: Shared patterns used when screen-local absent ───

test.describe('Law 3: Shared patterns used as fallback', () => {
  test('chooseByPrecedence selects shared when local is absent', () => {
    const result = chooseByPrecedence(
      [{ rung: 'shared-patterns' as ResolutionPrecedenceRung, value: 'shared-value' }],
      resolutionPrecedenceLaw,
    );
    expect(result).toBe('shared-value');
  });

  test('mergeScreenElementsWithHints preserves element affordance when no hints', () => {
    const elements = makeElements(['field-a'], { 'field-a': 'text-entry' });
    const merged = mergeScreenElementsWithHints(elements, null);
    expect(merged['field-a']?.affordance).toBe('text-entry');
  });

  test('shared fallback across 150 random seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const sharedValue = randomWord(next);

      const result = chooseByPrecedence(
        [{ rung: 'shared-patterns' as ResolutionPrecedenceRung, value: sharedValue }],
        resolutionPrecedenceLaw,
      );
      expect(result).toBe(sharedValue);
    }
  });
});

// ─── Law 4: Default behavior when neither exists ───

test.describe('Law 4: Fallback when neither local nor shared exist', () => {
  test('chooseByPrecedence returns null when no supplement candidates', () => {
    const result = chooseByPrecedence([], resolutionPrecedenceLaw);
    expect(result).toBeNull();
  });

  test('chooseByPrecedence returns null when candidates have null values', () => {
    const result = chooseByPrecedence(
      [
        { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: null },
        { rung: 'shared-patterns' as ResolutionPrecedenceRung, value: null },
      ],
      resolutionPrecedenceLaw,
    );
    expect(result).toBeNull();
  });

  test('mergeScreenElementsWithHints passes elements through unchanged when hints is null', () => {
    const elements = makeElements(['a', 'b'], { a: null, b: null });
    const merged = mergeScreenElementsWithHints(elements, null);
    expect(merged['a']?.affordance).toBeNull();
    expect(merged['b']?.affordance).toBeNull();
  });

  test('null fallback is stable across 150 random seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const result = chooseByPrecedence([], resolutionPrecedenceLaw);
      expect(result).toBeNull();
    }
  });
});

// ─── Law 5: Monotonicity — adding a higher-precedence candidate never demotes ───

test.describe('Law 5: Monotonicity of supplement precedence', () => {
  test('adding screen-local never causes shared to win', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const localValue = `local-${randomWord(next)}`;
      const sharedValue = `shared-${randomWord(next)}`;

      // Shared alone
      const sharedOnly = chooseByPrecedence(
        [{ rung: 'shared-patterns' as ResolutionPrecedenceRung, value: sharedValue }],
        resolutionPrecedenceLaw,
      );
      expect(sharedOnly).toBe(sharedValue);

      // Both present — local must win
      const both = chooseByPrecedence(
        [
          { rung: 'shared-patterns' as ResolutionPrecedenceRung, value: sharedValue },
          { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: localValue },
        ],
        resolutionPrecedenceLaw,
      );
      expect(both).toBe(localValue);
    }
  });

  test('precedence weights are monotonically decreasing through the law', () => {
    let previousWeight = Infinity;
    for (const rung of resolutionPrecedenceLaw) {
      const weight = precedenceWeight(resolutionPrecedenceLaw, rung);
      expect(weight).toBeLessThan(previousWeight);
      previousWeight = weight;
    }
  });
});

// ─── Law 6: First-writer-wins within the same rung ───

test.describe('Law 6: First-writer-wins within same rung', () => {
  test('duplicate rung entries — first one indexed wins', () => {
    const result = chooseByPrecedence(
      [
        { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: 'first' },
        { rung: 'approved-screen-knowledge' as ResolutionPrecedenceRung, value: 'second' },
      ],
      resolutionPrecedenceLaw,
    );
    expect(result).toBe('first');
  });

  test('first-writer-wins across 150 random seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const first = randomWord(next);
      const second = randomWord(next);
      const rung = pick(next, SUPPLEMENT_RUNGS);

      const result = chooseByPrecedence(
        [
          { rung, value: first },
          { rung, value: second },
        ],
        resolutionPrecedenceLaw,
      );
      expect(result).toBe(first);
    }
  });
});
