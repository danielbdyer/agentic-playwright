/**
 * Rung 8 LLM-assisted DOM exploration — Law Tests
 *
 * Invariants:
 *  1. Signal extraction determinism — same input always produces same signals
 *  2. Confidence bounds — always in [0, 1]
 *  3. Confidence monotonicity — more matching signals produce higher confidence
 *  4. Applicability requires non-null snapshot
 *  5. Resolution with empty snapshot yields resolved=false
 *  6. Config defaults are sensible (positive values, confidence in [0,1])
 *  7. Position constant is 8
 *  8. Strategy field is always 'rung8-llm-dom'
 *  9. domSignals are always a subset of extractable signals
 * 10. Pure function property — no side effects
 */

import { expect, test } from '@playwright/test';
import { mulberry32, randomWord, pick } from './support/random';
import {
  RUNG_8_POSITION,
  extractDomSignals,
  computeRung8Confidence,
  isRung8Applicable,
  attemptRung8Resolution,
  defaultRung8Config,
} from '../lib/runtime/agent/rung8-llm-dom';

// ─── Helpers ────────────────────────────────────────────────────────────────

const KNOWN_SIGNAL_NAMES: readonly string[] = [
  'aria-label-match',
  'role-match',
  'text-content-match',
  'id-attribute-present',
  'unique-landmark',
  'heading-structure',
  'form-context',
  'data-testid-present',
];

/** Generate a random DOM-like snapshot string. */
function randomSnapshot(next: () => number): string {
  const roles = ['button', 'textbox', 'link', 'checkbox', 'combobox', 'heading'];
  const fragments: string[] = [];
  const count = 1 + Math.floor(next() * 8);
  for (let i = 0; i < count; i++) {
    const role = pick(next, roles);
    const name = randomWord(next);
    const hasId = next() > 0.5;
    const hasTestId = next() > 0.7;
    const idAttr = hasId ? ` id="${randomWord(next)}"` : '';
    const testIdAttr = hasTestId ? ` data-testid="${randomWord(next)}"` : '';
    fragments.push(`<div role="${role}" name="${name}"${idAttr}${testIdAttr}>${name}</div>`);
  }
  if (next() > 0.5) fragments.push('<nav>navigation</nav>');
  if (next() > 0.5) fragments.push('<form><fieldset><legend>Form</legend></fieldset></form>');
  return fragments.join('\n');
}

/** Generate a random element hint that may or may not match snapshot content. */
function randomHint(next: () => number): string {
  const hints = ['button', 'textbox', 'Submit', 'Cancel', 'username', 'password', 'link', 'heading'];
  return next() > 0.3 ? pick(next, hints) : randomWord(next);
}

/** Build a snapshot guaranteed to contain progressively more signals for monotonicity testing. */
function snapshotWithSignalCount(hint: string, signalCount: number): string {
  const parts: string[] = [];
  const hintLower = hint.toLowerCase();
  if (signalCount >= 1) parts.push(`<div name="${hintLower}">${hintLower}</div>`);
  if (signalCount >= 2) parts.push(`<div role="button" name="${hintLower}"></div>`);
  if (signalCount >= 3) parts.push(`<span>${hintLower}</span>`);
  if (signalCount >= 4) parts.push(`<div id="main-${hintLower}"></div>`);
  if (signalCount >= 5) parts.push('<nav>navigation</nav>');
  if (signalCount >= 6) parts.push('<h1>heading</h1>');
  if (signalCount >= 7) parts.push('<form><fieldset><legend>Form</legend></fieldset></form>');
  if (signalCount >= 8) parts.push(`<div data-testid="test-${hintLower}"></div>`);
  return parts.join('\n');
}

// ─── Law 1: Signal extraction determinism ───────────────────────────────────

test('Law 1: Signal extraction is deterministic — same input always produces same signals', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const snapshot = randomSnapshot(next);
    const hint = randomHint(mulberry32(seed + 10000));

    const signals1 = extractDomSignals(snapshot, hint);
    const signals2 = extractDomSignals(snapshot, hint);

    expect(signals1).toEqual(signals2);
  }
});

// ─── Law 2: Confidence bounds — always in [0, 1] ───────────────────────────

test('Law 2: Confidence is always in [0, 1]', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const snapshot = randomSnapshot(next);
    const hint = randomHint(mulberry32(seed + 20000));

    const signals = extractDomSignals(snapshot, hint);
    const confidence = computeRung8Confidence(signals, hint);

    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  }
});

// ─── Law 3: Confidence monotonicity ────────────────────────────────────────

test('Law 3: More matching signals produce equal or higher confidence', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const hint = randomHint(next);
    if (hint.length === 0) continue;

    // Build snapshots with increasing signal counts
    const lowCount = 1 + Math.floor(mulberry32(seed + 30000)() * 3);
    const highCount = lowCount + 1 + Math.floor(mulberry32(seed + 40000)() * 4);
    const cappedHigh = Math.min(highCount, 8);

    const snapshotLow = snapshotWithSignalCount(hint, lowCount);
    const snapshotHigh = snapshotWithSignalCount(hint, cappedHigh);

    const signalsLow = extractDomSignals(snapshotLow, hint);
    const signalsHigh = extractDomSignals(snapshotHigh, hint);

    // Only assert monotonicity when high actually has more signals
    if (signalsHigh.length > signalsLow.length) {
      const confLow = computeRung8Confidence(signalsLow, hint);
      const confHigh = computeRung8Confidence(signalsHigh, hint);
      expect(confHigh).toBeGreaterThanOrEqual(confLow);
    }
  }
});

// ─── Law 4: Applicability requires non-null snapshot ────────────────────────

test('Law 4: isRung8Applicable returns false for null snapshot', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const hint = randomHint(next);

    expect(isRung8Applicable(null, hint)).toBe(false);
  }
});

// ─── Law 5: Resolution with empty snapshot yields resolved=false ────────────

test('Law 5: Resolution with empty snapshot yields resolved=false', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const hint = randomHint(next);

    const result = attemptRung8Resolution('', hint);

    expect(result.resolved).toBe(false);
    expect(result.selector).toBeNull();
    expect(result.confidence).toBe(0);
  }
});

// ─── Law 6: Config defaults are sensible ────────────────────────────────────

test('Law 6: Config defaults are sensible (positive values, confidence in [0,1])', () => {
  // Run 150 times to confirm pure construction — no randomness needed but
  // the law-style convention calls for 150 seeds.
  for (let seed = 1; seed <= 150; seed++) {
    const config = defaultRung8Config();

    expect(config.maxSnapshotLength).toBeGreaterThan(0);
    expect(config.timeoutMs).toBeGreaterThan(0);
    expect(config.confidenceThreshold).toBeGreaterThanOrEqual(0);
    expect(config.confidenceThreshold).toBeLessThanOrEqual(1);
  }
});

// ─── Law 7: Position constant is 8 ─────────────────────────────────────────

test('Law 7: RUNG_8_POSITION is 8', () => {
  for (let seed = 1; seed <= 150; seed++) {
    expect(RUNG_8_POSITION).toBe(8);
  }
});

// ─── Law 8: Strategy field is always rung8-llm-dom ──────────────────────────

test('Law 8: Strategy field is always rung8-llm-dom', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const snapshot = randomSnapshot(next);
    const hint = randomHint(mulberry32(seed + 50000));

    const result = attemptRung8Resolution(snapshot, hint);
    expect(result.strategy).toBe('rung8-llm-dom');
  }
});

// ─── Law 9: domSignals are a subset of extractable signals ──────────────────

test('Law 9: domSignals from resolution are a subset of known signal names', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const snapshot = randomSnapshot(next);
    const hint = randomHint(mulberry32(seed + 60000));

    const result = attemptRung8Resolution(snapshot, hint);

    for (const signal of result.domSignals) {
      expect(KNOWN_SIGNAL_NAMES).toContain(signal);
    }
  }
});

// ─── Law 10: Pure function property — no side effects ───────────────────────

test('Law 10: Pure function property — calling twice yields identical results', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const next = mulberry32(seed);
    const snapshot = randomSnapshot(next);
    const hint = randomHint(mulberry32(seed + 70000));

    const result1 = attemptRung8Resolution(snapshot, hint);
    const result2 = attemptRung8Resolution(snapshot, hint);

    expect(result1).toEqual(result2);

    // Also verify extractDomSignals and computeRung8Confidence individually
    const signals1 = extractDomSignals(snapshot, hint);
    const signals2 = extractDomSignals(snapshot, hint);
    expect(signals1).toEqual(signals2);

    const conf1 = computeRung8Confidence(signals1, hint);
    const conf2 = computeRung8Confidence(signals2, hint);
    expect(conf1).toBe(conf2);
  }
});
