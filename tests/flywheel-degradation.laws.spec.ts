import { expect, test } from '@playwright/test';
import {
  TIER_THRESHOLDS,
  tierToSettings,
  emaFps,
  computeTargetTier,
  type DegradationTier,
} from '../dashboard/src/hooks/use-degradation';

test.describe('Degradation controller laws', () => {

  test('Law 1: exactly 5 degradation tiers (0-4)', () => {
    expect(TIER_THRESHOLDS).toHaveLength(5);
    TIER_THRESHOLDS.forEach((t, i) => {
      expect(t.tier).toBe(i);
    });
  });

  test('Law 2: tier 0 (full quality) has bloom, glass, 3D, full particles', () => {
    const s = tierToSettings(0);
    expect(s.bloomEnabled).toBe(true);
    expect(s.glassTransmissionEnabled).toBe(true);
    expect(s.scene3dEnabled).toBe(true);
    expect(s.particleDensity).toBe(1.0);
    expect(s.staggerMultiplier).toBe(1.0);
  });

  test('Law 3: tier 1 disables only bloom', () => {
    const s = tierToSettings(1);
    expect(s.bloomEnabled).toBe(false);
    expect(s.glassTransmissionEnabled).toBe(true);
    expect(s.scene3dEnabled).toBe(true);
    expect(s.particleDensity).toBe(1.0);
  });

  test('Law 4: tier 2 halves particle density and doubles stagger', () => {
    const s = tierToSettings(2);
    expect(s.particleDensity).toBe(0.5);
    expect(s.staggerMultiplier).toBe(2.0);
  });

  test('Law 5: tier 3 disables glass transmission', () => {
    const s = tierToSettings(3);
    expect(s.glassTransmissionEnabled).toBe(false);
  });

  test('Law 6: tier 4 disables 3D scene (2D fallback)', () => {
    const s = tierToSettings(4);
    expect(s.scene3dEnabled).toBe(false);
    expect(s.particleDensity).toBe(0.25);
  });

  test('Law 7: each higher tier has equal or fewer visual features', () => {
    const tiers: readonly DegradationTier[] = [0, 1, 2, 3, 4];
    const scores = tiers.map((t) => {
      const s = tierToSettings(t);
      return (s.bloomEnabled ? 1 : 0) + (s.glassTransmissionEnabled ? 1 : 0)
        + (s.scene3dEnabled ? 1 : 0) + s.particleDensity;
    });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  test('Law 8: downgrade thresholds are strictly decreasing', () => {
    const thresholds = TIER_THRESHOLDS.map((t) => t.downgrade);
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeLessThan(thresholds[i - 1]!);
    }
  });

  test('Law 9: upgrade hold time is longer than downgrade hold time (hysteresis)', () => {
    // Tiers 1-3 should have longer upgrade hold than downgrade hold
    for (const t of TIER_THRESHOLDS.slice(1, 4)) {
      expect(t.upgradeHoldMs).toBeGreaterThan(t.downgradeHoldMs);
    }
  });

  test('Law 10: emaFps converges toward instantaneous FPS', () => {
    // Starting from 0, applying 60fps frames should converge toward 60
    const frameDelta = 1000 / 60; // ~16.67ms
    // After many iterations, EMA should approach 60
    const iterations = 100;
    const finalEma = Array.from({ length: iterations }).reduce<number>(
      (ema) => emaFps(ema, frameDelta),
      0,
    );
    expect(finalEma).toBeGreaterThan(55);
    expect(finalEma).toBeLessThan(65);
  });

  test('Law 11: emaFps handles zero/negative delta gracefully', () => {
    expect(emaFps(60, 0)).toBe(60);
    expect(emaFps(60, -1)).toBe(60);
  });

  test('Law 12: computeTargetTier downgrades when sustained below threshold', () => {
    const result = computeTargetTier(0, 30, 2000, 0);
    expect(result).toBe(1);
  });

  test('Law 13: computeTargetTier does not downgrade before hold time', () => {
    const result = computeTargetTier(0, 30, 1000, 0);
    expect(result).toBe(0);
  });

  test('Law 14: computeTargetTier upgrades when sustained above threshold', () => {
    const result = computeTargetTier(2, 40, 0, 8000);
    expect(result).toBe(1);
  });

  test('Law 15: computeTargetTier does not upgrade before hold time', () => {
    const result = computeTargetTier(2, 40, 0, 3000);
    expect(result).toBe(2);
  });

  test('Law 16: computeTargetTier cannot go below 0 or above 4', () => {
    const tryUpgrade = computeTargetTier(0, 120, 0, 100000);
    expect(tryUpgrade).toBe(0);

    const tryDowngrade = computeTargetTier(4, 5, 100000, 0);
    expect(tryDowngrade).toBe(4);
  });
});
