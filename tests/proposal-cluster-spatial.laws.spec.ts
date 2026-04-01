import { expect, test } from '@playwright/test';
import {
  pulseScale,
} from '../dashboard/src/spatial/proposal-cluster';
import {
  ARTIFACT_COLORS,
} from '../lib/domain/governance/proposal-cluster';

test.describe('ProposalCluster R3F laws', () => {
  test('Law 1: pulseScale oscillates around 1.0', () => {
    const values = Array.from({ length: 100 }, (_, i) => pulseScale(2.0, i * 0.1));
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(min).toBeGreaterThanOrEqual(0.8);
    expect(max).toBeLessThanOrEqual(1.2);
  });

  test('Law 2: pulseScale at t=0 is exactly 1.0', () => {
    expect(pulseScale(2.0, 0)).toBe(1.0);
  });

  test('Law 3: pulseScale amplitude is 0.1', () => {
    // At peak: 1.0 + 0.1 * 1 = 1.1
    const peak = pulseScale(1.0, 0.25); // sin(π/2) = 1
    expect(peak).toBeCloseTo(1.1, 5);
  });

  test('Law 4: higher pulseRate increases frequency', () => {
    // With rate 2 vs rate 1, the oscillation should differ at same time
    const slow = pulseScale(1.0, 0.1);
    const fast = pulseScale(2.0, 0.1);
    expect(slow).not.toBeCloseTo(fast, 5);
  });

  test('Law 5: all artifact types have colors', () => {
    const types = Object.keys(ARTIFACT_COLORS);
    expect(types.length).toBeGreaterThanOrEqual(5);
    types.forEach((type) => {
      expect(ARTIFACT_COLORS[type as keyof typeof ARTIFACT_COLORS]).toMatch(/^#/);
    });
  });
});
