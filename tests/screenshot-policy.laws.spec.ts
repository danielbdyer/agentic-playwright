/**
 * Screenshot Policy — law-style tests.
 *
 * Tests the pure screenshot capture policy ensuring:
 * - Failure always captures (highest priority)
 * - Agent interpretation captures
 * - Rung drift captures
 * - Hot screens capture
 * - Health-critical captures only when maturity is sufficient
 * - Normal steps skip capture
 * - Manifest pruning respects budget and priority ordering
 * - Capture rate estimation is accurate
 */

import { test, expect } from '@playwright/test';
import {
  evaluateScreenshotPolicy,
  pruneManifest,
  estimateCaptureRate,
  type StepScreenshotContext,
  type ScreenshotManifest,
  type ScreenshotManifestEntry,
} from '../product/application/runtime-support/screenshot-policy';

// ─── Helpers ───

function baseContext(overrides: Partial<StepScreenshotContext> = {}): StepScreenshotContext {
  return {
    failed: false,
    currentRung: 'approved-knowledge',
    previousRung: undefined,
    provenanceKind: 'approved-knowledge',
    screenId: 'login',
    isFirstStep: false,
    hotScreenIds: new Set(),
    ...overrides,
  };
}

function makeLearningSignals(overrides: Partial<{
  compositeHealthScore: number;
}> = {}) {
  return {
    timingRegressionRate: 0.1,
    selectorFlakinessRate: 0.1,
    recoveryEfficiency: 0.8,
    consoleNoiseLevel: 0.1,
    costEfficiency: 0.8,
    rungStability: 0.8,
    componentMaturityRate: 0.7,
    compositeHealthScore: 0.8,
    hotScreenCount: 0,
    ...overrides,
  };
}

// ─── Decision Laws ───

test.describe('evaluateScreenshotPolicy', () => {
  test('always captures on step failure', () => {
    const decision = evaluateScreenshotPolicy(baseContext({ failed: true }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('step-failure');
    expect(decision.priority).toBe(1.0);
  });

  test('failure takes priority over all other triggers', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      failed: true,
      provenanceKind: 'unresolved',
      hotScreenIds: new Set(['login']),
      isFirstStep: true,
    }));
    expect(decision.reason).toBe('step-failure');
  });

  test('captures on agent interpretation (unresolved provenance)', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      provenanceKind: 'unresolved',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('agent-interpretation');
    expect(decision.priority).toBe(0.9);
  });

  test('captures on agent-interpreted provenance', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      provenanceKind: 'agent-interpreted',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('agent-interpretation');
  });

  test('captures on rung drift (degradation from previous run)', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'live-exploration',
      previousRung: 'approved-knowledge',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('rung-drift');
    expect(decision.priority).toBe(0.8);
  });

  test('does not capture when rung improves (opposite of drift)', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'approved-knowledge',
      previousRung: 'live-exploration',
    }));
    expect(decision.capture).toBe(false);
  });

  test('does not capture when rung stays the same', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'approved-knowledge',
      previousRung: 'approved-knowledge',
    }));
    expect(decision.capture).toBe(false);
  });

  test('captures on hot screen', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      hotScreenIds: new Set(['login', 'dashboard']),
      screenId: 'login',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('hot-screen');
    expect(decision.priority).toBe(0.7);
  });

  test('does not capture when screen is not hot', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      hotScreenIds: new Set(['dashboard']),
      screenId: 'login',
    }));
    expect(decision.capture).toBe(false);
  });

  test('captures when health is critical and maturity is sufficient', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      learningSignals: makeLearningSignals({ compositeHealthScore: 0.2 }),
      maturity: 0.6,
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('health-critical');
    expect(decision.priority).toBe(0.6);
  });

  test('does not capture health-critical when maturity is low', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      learningSignals: makeLearningSignals({ compositeHealthScore: 0.2 }),
      maturity: 0.3,
    }));
    // Low maturity — don't trust the health signal yet
    expect(decision.reason).not.toBe('health-critical');
  });

  test('does not capture health-critical when health is above threshold', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      learningSignals: makeLearningSignals({ compositeHealthScore: 0.5 }),
      maturity: 0.8,
    }));
    expect(decision.capture).toBe(false);
  });

  test('captures first step with lowest priority', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      isFirstStep: true,
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('first-step');
    expect(decision.priority).toBe(0.2);
  });

  test('skips normal healthy step', () => {
    const decision = evaluateScreenshotPolicy(baseContext());
    expect(decision.capture).toBe(false);
    expect(decision.reason).toBe('none');
    expect(decision.priority).toBe(0);
  });

  test('priority ordering: failure > agent > drift > hot > health > first', () => {
    const priorities = [
      evaluateScreenshotPolicy(baseContext({ failed: true })).priority,
      evaluateScreenshotPolicy(baseContext({ provenanceKind: 'unresolved' })).priority,
      evaluateScreenshotPolicy(baseContext({ currentRung: 'live-exploration', previousRung: 'approved-knowledge' })).priority,
      evaluateScreenshotPolicy(baseContext({ hotScreenIds: new Set(['login']), screenId: 'login' })).priority,
      evaluateScreenshotPolicy(baseContext({ learningSignals: makeLearningSignals({ compositeHealthScore: 0.1 }), maturity: 0.8 })).priority,
      evaluateScreenshotPolicy(baseContext({ isFirstStep: true })).priority,
    ];
    // Each priority must be strictly greater than the next
    for (let i = 0; i < priorities.length - 1; i++) {
      expect(priorities[i]).toBeGreaterThan(priorities[i + 1]!);
    }
  });
});

// ─── Rung Drift Edge Cases ───

test.describe('rung drift detection', () => {
  test('no drift when no previous rung', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'needs-human',
      previousRung: undefined,
    }));
    expect(decision.reason).not.toBe('rung-drift');
  });

  test('drift from explicit-scenario to needs-human', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'needs-human',
      previousRung: 'explicit-scenario',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('rung-drift');
  });

  test('unknown rung treated as lowest', () => {
    const decision = evaluateScreenshotPolicy(baseContext({
      currentRung: 'unknown-rung',
      previousRung: 'approved-knowledge',
    }));
    expect(decision.capture).toBe(true);
    expect(decision.reason).toBe('rung-drift');
  });
});

// ─── Manifest Pruning ───

test.describe('pruneManifest', () => {
  function makeEntry(priority: number, stepKey: string): ScreenshotManifestEntry {
    return {
      stepKey,
      screenId: 'screen',
      reason: 'step-failure',
      priority,
      capturedAt: '2025-01-01T00:00:00Z',
      filePath: `/screenshots/${stepKey}.png`,
    };
  }

  test('returns manifest unchanged when under budget', () => {
    const manifest: ScreenshotManifest = {
      kind: 'screenshot-manifest',
      version: 1,
      entries: [makeEntry(1.0, 'a'), makeEntry(0.5, 'b')],
    };
    expect(pruneManifest(manifest, 5)).toBe(manifest);
  });

  test('prunes to budget keeping highest priority', () => {
    const manifest: ScreenshotManifest = {
      kind: 'screenshot-manifest',
      version: 1,
      entries: [
        makeEntry(0.2, 'low'),
        makeEntry(1.0, 'high'),
        makeEntry(0.5, 'mid'),
      ],
    };
    const pruned = pruneManifest(manifest, 2);
    expect(pruned.entries).toHaveLength(2);
    expect(pruned.entries[0]!.stepKey).toBe('high');
    expect(pruned.entries[1]!.stepKey).toBe('mid');
  });

  test('prunes to exactly maxEntries', () => {
    const entries = Array.from({ length: 100 }, (_, i) => makeEntry(i / 100, `step-${i}`));
    const manifest: ScreenshotManifest = { kind: 'screenshot-manifest', version: 1, entries };
    const pruned = pruneManifest(manifest, 10);
    expect(pruned.entries).toHaveLength(10);
    // All kept entries should have priority >= all pruned entries
    const minKept = Math.min(...pruned.entries.map((e) => e.priority));
    const maxPruned = Math.max(
      ...entries.filter((e) => !pruned.entries.includes(e)).map((e) => e.priority),
    );
    expect(minKept).toBeGreaterThanOrEqual(maxPruned);
  });
});

// ─── Capture Rate Estimation ───

test.describe('estimateCaptureRate', () => {
  test('returns 0 for empty contexts', () => {
    expect(estimateCaptureRate([])).toBe(0);
  });

  test('returns 1 when all steps fail', () => {
    const contexts = Array.from({ length: 5 }, () => baseContext({ failed: true }));
    expect(estimateCaptureRate(contexts)).toBe(1);
  });

  test('returns 0 when all steps are normal', () => {
    const contexts = Array.from({ length: 5 }, () => baseContext());
    expect(estimateCaptureRate(contexts)).toBe(0);
  });

  test('returns correct ratio for mixed contexts', () => {
    const contexts = [
      baseContext({ failed: true }),
      baseContext(),
      baseContext({ provenanceKind: 'unresolved' }),
      baseContext(),
    ];
    expect(estimateCaptureRate(contexts)).toBe(0.5);
  });
});
