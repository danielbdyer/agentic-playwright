import { expect, test } from '@playwright/test';
import {
  computeDegradationState,
  formatFps,
  TIER_LABELS,
  TIER_COLORS,
  type DegradationTier,
} from '../dashboard/src/organisms/degradation-controller';

test.describe('DegradationController laws', () => {
  test('Law 1: tier 0 at 60fps has full quality', () => {
    const state = computeDegradationState(60, 0);
    expect(state.tier).toBe(0);
    expect(state.bloomEnabled).toBe(true);
    expect(state.particleDensity).toBe(1.0);
    expect(state.glassPaneMode).toBe('full');
    expect(state.use3D).toBe(true);
  });

  test('Law 2: below 45fps triggers degradation', () => {
    const state = computeDegradationState(40, 0);
    expect(state.tier).toBeGreaterThan(0);
  });

  test('Law 3: above 55fps triggers recovery', () => {
    const state = computeDegradationState(58, 2);
    expect(state.tier).toBeLessThan(2);
  });

  test('Law 4: between 45-55fps maintains current tier (hysteresis)', () => {
    const state = computeDegradationState(50, 2);
    expect(state.tier).toBe(2);
  });

  test('Law 5: tier never exceeds 4', () => {
    const state = computeDegradationState(10, 4);
    expect(state.tier).toBeLessThanOrEqual(4);
  });

  test('Law 6: tier never goes below 0', () => {
    const state = computeDegradationState(120, 0);
    expect(state.tier).toBeGreaterThanOrEqual(0);
  });

  test('Law 7: tier 1 disables bloom', () => {
    const state = computeDegradationState(60, 1);
    // Tier 1 at 60fps should recover to 0
    // But at 50fps (hysteresis), stays at 1
    const stateAt50 = computeDegradationState(50, 1);
    expect(stateAt50.bloomEnabled).toBe(false);
  });

  test('Law 8: tier >= 2 reduces particles', () => {
    const state = computeDegradationState(50, 2);
    expect(state.particleDensity).toBe(0.5);
  });

  test('Law 9: tier >= 3 simplifies glass pane', () => {
    const state = computeDegradationState(50, 3);
    expect(state.glassPaneMode).toBe('flat');
  });

  test('Law 10: tier 4 disables 3D', () => {
    const state = computeDegradationState(50, 4);
    expect(state.use3D).toBe(false);
  });

  test('Law 11: formatFps rounds to integer', () => {
    expect(formatFps(59.7)).toBe('60 fps');
  });

  test('Law 12: all tiers have labels', () => {
    ([0, 1, 2, 3, 4] as const).forEach((tier) => {
      expect(TIER_LABELS[tier].length).toBeGreaterThan(0);
    });
  });

  test('Law 13: all tiers have colors', () => {
    ([0, 1, 2, 3, 4] as const).forEach((tier) => {
      expect(TIER_COLORS[tier]).toMatch(/^#/);
    });
  });

  test('Law 14: tiers have distinct colors', () => {
    const colors = ([0, 1, 2, 3, 4] as const).map((t) => TIER_COLORS[t]);
    expect(new Set(colors).size).toBe(5);
  });
});
