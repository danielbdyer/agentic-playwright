import { expect, test } from '@playwright/test';

import { computeRiskScore, predictBreakage } from '../lib/domain/breakage-simulator';
import type { ScenarioBinding, StepBinding } from '../lib/domain/breakage-simulator';
import type { BreakagePrediction, HypotheticalDomChange } from '../lib/domain/types/breakage-sim';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeStep = (overrides: Partial<StepBinding> & { readonly stepIndex: number }): StepBinding => ({
  selectors: overrides.selectors ?? ['#submit'],
  screenId: overrides.screenId ?? null,
  hasLocatorLadder: overrides.hasLocatorLadder ?? false,
  locatorRungs: overrides.locatorRungs ?? 1,
  stepIndex: overrides.stepIndex,
});

const makeScenario = (
  scenarioId: string,
  steps: readonly StepBinding[],
): ScenarioBinding => ({ scenarioId, steps });

const makeChange = (
  overrides?: Partial<HypotheticalDomChange>,
): HypotheticalDomChange => ({
  selector: overrides?.selector ?? '#submit',
  changeKind: overrides?.changeKind ?? 'removed',
  description: overrides?.description ?? 'button removed',
  affectedScreen: overrides?.affectedScreen ?? null,
});

// ---------------------------------------------------------------------------
// Law: exact selector match with no fallback → will-break
// ---------------------------------------------------------------------------

test('exact match with no fallback produces will-break', () => {
  const result = predictBreakage(
    [makeChange()],
    [makeScenario('S1', [makeStep({ stepIndex: 0, selectors: ['#submit'], locatorRungs: 1, hasLocatorLadder: false })])],
  );

  expect(result.predictions).toHaveLength(1);
  const p0 = result.predictions[0]!;
  expect(p0.severity).toBe('will-break');
  expect(p0.fallbackAvailable).toBe(false);
});

// ---------------------------------------------------------------------------
// Law: exact match with locator ladder → likely-degrade
// ---------------------------------------------------------------------------

test('exact match with ladder produces likely-degrade', () => {
  const result = predictBreakage(
    [makeChange()],
    [makeScenario('S1', [makeStep({ stepIndex: 0, selectors: ['#submit'], locatorRungs: 3, hasLocatorLadder: true })])],
  );

  expect(result.predictions).toHaveLength(1);
  const p0 = result.predictions[0]!;
  expect(p0.severity).toBe('likely-degrade');
  expect(p0.fallbackAvailable).toBe(true);
});

// ---------------------------------------------------------------------------
// Law: partial match → possibly-affected
// ---------------------------------------------------------------------------

test('partial match produces possibly-affected', () => {
  const result = predictBreakage(
    [makeChange({ selector: '#submit' })],
    [makeScenario('S1', [makeStep({ stepIndex: 0, selectors: ['#submit-button'] })])],
  );

  expect(result.predictions).toHaveLength(1);
  expect(result.predictions[0]!.severity).toBe('possibly-affected');
});

// ---------------------------------------------------------------------------
// Law: no match → not in predictions
// ---------------------------------------------------------------------------

test('no match produces no predictions', () => {
  const result = predictBreakage(
    [makeChange({ selector: '#cancel' })],
    [makeScenario('S1', [makeStep({ stepIndex: 0, selectors: ['#submit'] })])],
  );

  expect(result.predictions).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// Law: screen-level matching
// ---------------------------------------------------------------------------

test('screen-level match produces possibly-affected', () => {
  const result = predictBreakage(
    [makeChange({ selector: '#something-else', affectedScreen: 'login-screen' })],
    [makeScenario('S1', [makeStep({ stepIndex: 0, selectors: ['#username'], screenId: 'login-screen' })])],
  );

  expect(result.predictions).toHaveLength(1);
  const p0 = result.predictions[0]!;
  expect(p0.severity).toBe('possibly-affected');
  expect(p0.reason).toContain('login-screen');
});

// ---------------------------------------------------------------------------
// Law: risk score computation
// ---------------------------------------------------------------------------

test('computeRiskScore weights severities correctly', () => {
  const predictions: readonly BreakagePrediction[] = [
    {
      scenarioId: 'S1', stepIndex: 0, affectedSelector: '#a',
      changeKind: 'removed', severity: 'will-break', reason: '', fallbackAvailable: false,
    },
    {
      scenarioId: 'S2', stepIndex: 0, affectedSelector: '#b',
      changeKind: 'renamed', severity: 'likely-degrade', reason: '', fallbackAvailable: true,
    },
    {
      scenarioId: 'S3', stepIndex: 0, affectedSelector: '#c',
      changeKind: 'relocated', severity: 'possibly-affected', reason: '', fallbackAvailable: false,
    },
  ];

  // (1.0 + 0.5 + 0.1) / 5 = 0.32
  const score = computeRiskScore(predictions, 5);
  expect(score).toBeCloseTo(0.32, 5);
});

test('computeRiskScore caps at 1.0', () => {
  const predictions: readonly BreakagePrediction[] = [
    {
      scenarioId: 'S1', stepIndex: 0, affectedSelector: '#a',
      changeKind: 'removed', severity: 'will-break', reason: '', fallbackAvailable: false,
    },
    {
      scenarioId: 'S1', stepIndex: 1, affectedSelector: '#b',
      changeKind: 'removed', severity: 'will-break', reason: '', fallbackAvailable: false,
    },
  ];

  // (1.0 + 1.0) / 1 = 2.0 → capped at 1.0
  const score = computeRiskScore(predictions, 1);
  expect(score).toBe(1.0);
});

// ---------------------------------------------------------------------------
// Law: empty changes → empty predictions
// ---------------------------------------------------------------------------

test('empty changes produce empty predictions', () => {
  const result = predictBreakage(
    [],
    [makeScenario('S1', [makeStep({ stepIndex: 0 })])],
  );

  expect(result.predictions).toHaveLength(0);
  expect(result.summary.affectedScenarios).toBe(0);
  expect(result.summary.riskScore).toBe(0);
});

// ---------------------------------------------------------------------------
// Law: summary counts are correct
// ---------------------------------------------------------------------------

test('summary counts match prediction severities', () => {
  const scenarios = [
    makeScenario('S1', [
      makeStep({ stepIndex: 0, selectors: ['#submit'], locatorRungs: 1, hasLocatorLadder: false }),
    ]),
    makeScenario('S2', [
      makeStep({ stepIndex: 0, selectors: ['#submit'], locatorRungs: 2, hasLocatorLadder: true }),
    ]),
    makeScenario('S3', [
      makeStep({ stepIndex: 0, selectors: ['#submit-form'] }),
    ]),
    makeScenario('S4', [
      makeStep({ stepIndex: 0, selectors: ['#unrelated'] }),
    ]),
  ];

  const result = predictBreakage([makeChange({ selector: '#submit' })], scenarios);

  expect(result.summary.totalScenarios).toBe(4);
  expect(result.summary.willBreak).toBe(1);
  expect(result.summary.likelyDegrade).toBe(1);
  expect(result.summary.possiblyAffected).toBe(1);
  expect(result.summary.affectedScenarios).toBe(3);
  expect(result.summary.riskScore).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// Law: result envelope shape
// ---------------------------------------------------------------------------

test('result carries correct envelope fields', () => {
  const result = predictBreakage([], []);

  expect(result.kind).toBe('breakage-simulation');
  expect(result.version).toBe(1);
  expect(result.changes).toEqual([]);
  expect(result.predictions).toEqual([]);
});
