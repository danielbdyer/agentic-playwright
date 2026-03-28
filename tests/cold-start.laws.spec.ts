import { expect, test } from '@playwright/test';

import {
  COMMON_WEB_SEED,
  FORM_HEAVY_SEED,
  evaluateColdStartProgress,
  mergeSeedPacks,
  selectSeedPacks,
  shouldGraduate,
} from '../lib/domain/cold-start';
import type { ColdStartConfig, SeedPackKind } from '../lib/domain/types/cold-start';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: ColdStartConfig = {
  seedPacks: ['common-web'],
  discoveryBudget: 10,
  breadthFirst: true,
  maxScreensPerIteration: 5,
  minCoverageForGraduation: 0.8,
};

// ---------------------------------------------------------------------------
// Law: selectSeedPacks — known kind returns pack with patterns
// ---------------------------------------------------------------------------

test('select common-web returns pack with patterns', () => {
  const packs = selectSeedPacks(['common-web']);
  expect(packs).toHaveLength(1);
  expect(packs[0]!.kind).toBe('common-web');
  expect(packs[0]!.patterns.length).toBeGreaterThan(0);
  expect(packs[0]!.widgets.length).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Law: selectSeedPacks — unknown kind returns empty pack
// ---------------------------------------------------------------------------

test('unknown seed kind returns empty pack', () => {
  const packs = selectSeedPacks(['custom']);
  expect(packs).toHaveLength(1);
  expect(packs[0]!.patterns).toHaveLength(0);
  expect(packs[0]!.widgets).toHaveLength(0);
  expect(packs[0]!.routes).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Law: mergeSeedPacks — deduplicates patterns by name
// ---------------------------------------------------------------------------

test('merge two packs deduplicates patterns by name', () => {
  const merged = mergeSeedPacks([COMMON_WEB_SEED, FORM_HEAVY_SEED]);

  // Both packs have 'text-input' and 'checkbox' and 'submit-button' — should appear once each
  const textInputs = merged.patterns.filter((p) => p.name === 'text-input');
  expect(textInputs).toHaveLength(1);

  const checkboxes = merged.patterns.filter((p) => p.name === 'checkbox');
  expect(checkboxes).toHaveLength(1);

  const submitButtons = merged.patterns.filter((p) => p.name === 'submit-button');
  expect(submitButtons).toHaveLength(1);

  // Total unique pattern count: common-web has 5, form-heavy adds email-input,
  // password-input, textarea, radio-button, select-dropdown, reset-button, date-input = 7 new
  expect(merged.patterns.length).toBe(12);
});

// ---------------------------------------------------------------------------
// Law: mergeSeedPacks — preserves all widget types
// ---------------------------------------------------------------------------

test('merge preserves all widget types', () => {
  const merged = mergeSeedPacks([COMMON_WEB_SEED, FORM_HEAVY_SEED]);

  const componentTypes = merged.widgets.map((w) => w.componentType);

  // Common-web: button, text-field, dropdown
  // Form-heavy: text-field (dup), email-field, password-field, dropdown (dup),
  //             radio-group, checkbox, date-picker
  expect(componentTypes).toContain('button');
  expect(componentTypes).toContain('text-field');
  expect(componentTypes).toContain('dropdown');
  expect(componentTypes).toContain('email-field');
  expect(componentTypes).toContain('password-field');
  expect(componentTypes).toContain('radio-group');
  expect(componentTypes).toContain('checkbox');
  expect(componentTypes).toContain('date-picker');

  // text-field and dropdown should be deduped
  const textFields = merged.widgets.filter((w) => w.componentType === 'text-field');
  expect(textFields).toHaveLength(1);

  const dropdowns = merged.widgets.filter((w) => w.componentType === 'dropdown');
  expect(dropdowns).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Law: evaluateColdStartProgress — coverage rate computation
// ---------------------------------------------------------------------------

test('progress tracking computes correct coverage rate', () => {
  const progress = evaluateColdStartProgress(defaultConfig, 10, 6, 3);

  expect(progress.kind).toBe('cold-start-progress');
  expect(progress.iteration).toBe(3);
  expect(progress.discoveredScreens).toBe(10);
  expect(progress.coveredScreens).toBe(6);
  expect(progress.coverageRate).toBeCloseTo(0.6);
  expect(progress.graduated).toBe(false);
  expect(progress.remainingBudget).toBe(7);
});

// ---------------------------------------------------------------------------
// Law: graduation — coverage threshold met
// ---------------------------------------------------------------------------

test('graduation when coverage threshold met', () => {
  const progress = evaluateColdStartProgress(defaultConfig, 10, 8, 3);

  expect(progress.coverageRate).toBeCloseTo(0.8);
  expect(progress.graduated).toBe(true);
  expect(shouldGraduate(progress, defaultConfig)).toBe(true);
});

// ---------------------------------------------------------------------------
// Law: graduation — budget exhausted
// ---------------------------------------------------------------------------

test('graduation when budget exhausted', () => {
  const progress = evaluateColdStartProgress(defaultConfig, 10, 2, 10);

  expect(progress.remainingBudget).toBe(0);
  expect(progress.graduated).toBe(true);
  expect(shouldGraduate(progress, defaultConfig)).toBe(true);
});

// ---------------------------------------------------------------------------
// Law: zero discovered screens yields zero coverage
// ---------------------------------------------------------------------------

test('zero discovered screens yields zero coverage and no graduation', () => {
  const progress = evaluateColdStartProgress(defaultConfig, 0, 0, 1);

  expect(progress.coverageRate).toBe(0);
  expect(progress.graduated).toBe(false);
});

// ---------------------------------------------------------------------------
// Law: selectSeedPacks — multiple kinds
// ---------------------------------------------------------------------------

test('select multiple kinds returns all matching packs', () => {
  const kinds: readonly SeedPackKind[] = ['common-web', 'form-heavy', 'dashboard'];
  const packs = selectSeedPacks(kinds);

  expect(packs).toHaveLength(3);
  expect(packs[0]!.kind).toBe('common-web');
  expect(packs[1]!.kind).toBe('form-heavy');
  expect(packs[2]!.kind).toBe('dashboard');
});

// ---------------------------------------------------------------------------
// Law: mergeSeedPacks — empty input
// ---------------------------------------------------------------------------

test('merge empty array returns empty merged pack', () => {
  const merged = mergeSeedPacks([]);

  expect(merged.patterns).toHaveLength(0);
  expect(merged.widgets).toHaveLength(0);
  expect(merged.routes).toHaveLength(0);
});
