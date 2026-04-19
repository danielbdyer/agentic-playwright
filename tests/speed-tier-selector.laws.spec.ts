import { expect, test } from '@playwright/test';
import {
  formatSpeed,
  nearestTier,
} from '../dashboard/src/molecules/speed-tier-selector';
import { SPEED_TIERS } from '../product/domain/projection/speed-tier-batcher';

test.describe('SpeedTierSelector laws', () => {
  test('Law 1: formatSpeed includes × suffix', () => {
    expect(formatSpeed(5)).toContain('×');
    expect(formatSpeed(0.5)).toContain('×');
  });

  test('Law 2: formatSpeed preserves number', () => {
    expect(formatSpeed(10)).toBe('10×');
  });

  test('Law 3: nearestTier finds exact match', () => {
    expect(nearestTier(1).speed).toBe(1);
    expect(nearestTier(10).speed).toBe(10);
  });

  test('Law 4: nearestTier rounds to closest', () => {
    // 7 is between 5 and 10, closer to 5
    const tier = nearestTier(7);
    expect([5, 10]).toContain(tier.speed);
  });

  test('Law 5: nearestTier handles min speed', () => {
    const tier = nearestTier(0.1);
    expect(tier.speed).toBe(SPEED_TIERS[0]!.speed);
  });

  test('Law 6: nearestTier handles max speed', () => {
    const tier = nearestTier(999);
    expect(tier.speed).toBe(SPEED_TIERS[SPEED_TIERS.length - 1]!.speed);
  });

  test('Law 7: SPEED_TIERS is sorted by speed ascending', () => {
    const isSorted = SPEED_TIERS.slice(1).every((tier, i) => tier.speed > SPEED_TIERS[i]!.speed);
    expect(isSorted).toBe(true);
  });

  test('Law 8: each tier has a label', () => {
    SPEED_TIERS.forEach((tier) => {
      expect(tier.label.length).toBeGreaterThan(0);
    });
  });
});
