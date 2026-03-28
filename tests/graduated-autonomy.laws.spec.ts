/**
 * Graduated Autonomy Profiles — Law Tests (N1.9)
 *
 * Verifies the pure computation logic for per-screen trust levels.
 *
 * Laws:
 *   1. New screen (0 runs) → manual
 *   2. 3 successful runs → supervised
 *   3. 10+ runs at 95%+ → autonomous
 *   4. Promotion from manual → supervised
 *   5. Promotion from supervised → autonomous
 *   6. Demotion on consecutive failures
 *   7. No promotion when already at correct level
 *   8. Success rate below threshold → stays at lower level
 *   9. Custom thresholds work correctly
 */

import { expect, test } from '@playwright/test';
import {
  computeAutonomyProfile,
  DEFAULT_THRESHOLDS,
  evaluateDemotion,
  evaluatePromotion,
} from '../lib/domain/graduated-autonomy';
import type { AutonomyThresholds } from '../lib/domain/types/autonomy';

// ─── Helpers ───

function makeRuns(count: number, success: boolean, startDate: string = '2026-01-01T00:00:00Z'): readonly { success: boolean; runAt: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    success,
    runAt: new Date(new Date(startDate).getTime() + i * 3600_000).toISOString(),
  }));
}

function makeMixedRuns(
  successCount: number,
  failureCount: number,
  startDate: string = '2026-01-01T00:00:00Z',
): readonly { success: boolean; runAt: string }[] {
  const successes = makeRuns(successCount, true, startDate);
  const failures = makeRuns(failureCount, false, new Date(new Date(startDate).getTime() + successCount * 3600_000).toISOString());
  return [...successes, ...failures];
}

// ─── Law 1: New screen (0 runs) → manual ───

test('Law 1: new screen with zero runs is manual', () => {
  const profile = computeAutonomyProfile('screen-new', []);
  expect(profile.level).toBe('manual');
  expect(profile.totalRuns).toBe(0);
  expect(profile.successfulRuns).toBe(0);
  expect(profile.successRate).toBe(0);
  expect(profile.promotedAt).toBeNull();
});

// ─── Law 2: 3 successful runs → supervised ───

test('Law 2: three successful runs promote to supervised', () => {
  const runs = makeRuns(3, true);
  const profile = computeAutonomyProfile('screen-a', runs);
  expect(profile.level).toBe('supervised');
  expect(profile.totalRuns).toBe(3);
  expect(profile.successfulRuns).toBe(3);
  expect(profile.successRate).toBe(1);
  expect(profile.promotedAt).not.toBeNull();
});

// ─── Law 3: 10+ runs at 95%+ → autonomous ───

test('Law 3: ten successful runs at 100% promote to autonomous', () => {
  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-b', runs);
  expect(profile.level).toBe('autonomous');
  expect(profile.totalRuns).toBe(10);
  expect(profile.successRate).toBe(1);
});

test('Law 3: twenty runs with one failure (95%) promote to autonomous', () => {
  const runs = [...makeRuns(19, true), ...makeRuns(1, false, '2026-01-02T00:00:00Z')];
  const profile = computeAutonomyProfile('screen-c', runs);
  expect(profile.level).toBe('autonomous');
  expect(profile.totalRuns).toBe(20);
  expect(profile.successRate).toBe(0.95);
});

// ─── Law 4: Promotion from manual → supervised ───

test('Law 4: evaluatePromotion returns manual → supervised when thresholds met', () => {
  const profile = computeAutonomyProfile('screen-d', makeRuns(1, true));
  expect(profile.level).toBe('manual');

  // Now give it enough runs for supervised
  const updatedProfile = computeAutonomyProfile('screen-d', makeRuns(3, true));
  // Simulate: profile is still marked manual but stats warrant supervised
  const manualProfile = { ...updatedProfile, level: 'manual' as const };
  const promotion = evaluatePromotion(manualProfile);
  expect(promotion).not.toBeNull();
  expect(promotion!.previousLevel).toBe('manual');
  expect(promotion!.newLevel).toBe('supervised');
});

// ─── Law 5: Promotion from supervised → autonomous ───

test('Law 5: evaluatePromotion returns supervised → autonomous when thresholds met', () => {
  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-e', runs);
  // Force level to supervised to test promotion
  const supervisedProfile = { ...profile, level: 'supervised' as const };
  const promotion = evaluatePromotion(supervisedProfile);
  expect(promotion).not.toBeNull();
  expect(promotion!.previousLevel).toBe('supervised');
  expect(promotion!.newLevel).toBe('autonomous');
});

// ─── Law 6: Demotion on consecutive failures ───

test('Law 6: demotion from autonomous to supervised on 3 recent failures', () => {
  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-f', runs);
  expect(profile.level).toBe('autonomous');

  const demotion = evaluateDemotion(profile, 3);
  expect(demotion).not.toBeNull();
  expect(demotion!.previousLevel).toBe('autonomous');
  expect(demotion!.newLevel).toBe('supervised');
});

test('Law 6: demotion from supervised to manual on 3 recent failures', () => {
  const runs = makeRuns(3, true);
  const profile = computeAutonomyProfile('screen-g', runs);
  expect(profile.level).toBe('supervised');

  const demotion = evaluateDemotion(profile, 3);
  expect(demotion).not.toBeNull();
  expect(demotion!.previousLevel).toBe('supervised');
  expect(demotion!.newLevel).toBe('manual');
});

test('Law 6: no demotion from manual (already lowest)', () => {
  const profile = computeAutonomyProfile('screen-h', []);
  expect(profile.level).toBe('manual');

  const demotion = evaluateDemotion(profile, 5);
  expect(demotion).toBeNull();
});

test('Law 6: no demotion when failures below threshold', () => {
  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-i', runs);
  expect(profile.level).toBe('autonomous');

  const demotion = evaluateDemotion(profile, 2);
  expect(demotion).toBeNull();
});

// ─── Law 7: No promotion when already at correct level ───

test('Law 7: no promotion when already at derived level', () => {
  const runs = makeRuns(3, true);
  const profile = computeAutonomyProfile('screen-j', runs);
  expect(profile.level).toBe('supervised');

  const promotion = evaluatePromotion(profile);
  expect(promotion).toBeNull();
});

test('Law 7: no promotion for autonomous profile', () => {
  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-k', runs);
  expect(profile.level).toBe('autonomous');

  const promotion = evaluatePromotion(profile);
  expect(promotion).toBeNull();
});

// ─── Law 8: Success rate below threshold → stays at lower level ───

test('Law 8: three runs with low success rate stays manual', () => {
  const runs = makeMixedRuns(2, 1); // 66.7% < 80%
  const profile = computeAutonomyProfile('screen-l', runs);
  expect(profile.level).toBe('manual');
  expect(profile.totalRuns).toBe(3);
  expect(profile.successRate).toBeCloseTo(0.667, 2);
});

test('Law 8: ten runs below autonomous success rate stays supervised', () => {
  const runs = makeMixedRuns(9, 1); // 90% < 95%
  const profile = computeAutonomyProfile('screen-m', runs);
  expect(profile.level).toBe('supervised');
  expect(profile.totalRuns).toBe(10);
  expect(profile.successRate).toBe(0.9);
});

// ─── Law 9: Custom thresholds work correctly ───

test('Law 9: custom thresholds — lower bar for supervised', () => {
  const customThresholds: AutonomyThresholds = {
    supervisedMinRuns: 1,
    supervisedMinSuccessRate: 0.5,
    autonomousMinRuns: 5,
    autonomousMinSuccessRate: 0.9,
  };

  const runs = makeRuns(1, true);
  const profile = computeAutonomyProfile('screen-n', runs, customThresholds);
  expect(profile.level).toBe('supervised');
});

test('Law 9: custom thresholds — higher bar for autonomous', () => {
  const customThresholds: AutonomyThresholds = {
    supervisedMinRuns: 3,
    supervisedMinSuccessRate: 0.8,
    autonomousMinRuns: 20,
    autonomousMinSuccessRate: 0.99,
  };

  const runs = makeRuns(10, true);
  const profile = computeAutonomyProfile('screen-o', runs, customThresholds);
  expect(profile.level).toBe('supervised'); // only 10 runs, need 20
});

test('Law 9: custom thresholds — promotion respects custom values', () => {
  const customThresholds: AutonomyThresholds = {
    supervisedMinRuns: 2,
    supervisedMinSuccessRate: 0.5,
    autonomousMinRuns: 4,
    autonomousMinSuccessRate: 0.75,
  };

  const runs = makeRuns(4, true);
  const profile = computeAutonomyProfile('screen-p', runs, customThresholds);
  expect(profile.level).toBe('autonomous');
});

// ─── Default thresholds sanity ───

test('DEFAULT_THRESHOLDS has expected values', () => {
  expect(DEFAULT_THRESHOLDS.supervisedMinRuns).toBe(3);
  expect(DEFAULT_THRESHOLDS.supervisedMinSuccessRate).toBe(0.8);
  expect(DEFAULT_THRESHOLDS.autonomousMinRuns).toBe(10);
  expect(DEFAULT_THRESHOLDS.autonomousMinSuccessRate).toBe(0.95);
});
