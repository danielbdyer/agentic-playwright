import { expect, test } from '@playwright/test';
import { SPEED_TIERS } from '../dashboard/src/hooks/use-playback-controller';

test.describe('Playback controller laws', () => {
  test('Law 1: seven speed tiers', () => {
    expect(SPEED_TIERS).toHaveLength(7);
  });

  test('Law 2: monotonically increasing speeds', () => {
    for (let i = 1; i < SPEED_TIERS.length; i++) {
      expect(SPEED_TIERS[i]!.speed).toBeGreaterThan(SPEED_TIERS[i - 1]!.speed);
    }
  });

  test('Law 3: all speeds are positive', () => {
    SPEED_TIERS.forEach((tier) => {
      expect(tier.speed).toBeGreaterThan(0);
    });
  });

  test('Law 4: all tiers have non-empty labels', () => {
    SPEED_TIERS.forEach((tier) => {
      expect(tier.label.length).toBeGreaterThan(0);
    });
  });

  test('Law 5: includes real-time tier at speed 1', () => {
    const realTime = SPEED_TIERS.find((t) => t.speed === 1);
    expect(realTime).toBeDefined();
  });

  test('Law 6: speed range 0.5 to 100', () => {
    expect(SPEED_TIERS[0]!.speed).toBe(0.5);
    expect(SPEED_TIERS[SPEED_TIERS.length - 1]!.speed).toBe(100);
  });
});
