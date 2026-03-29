import { expect, test } from '@playwright/test';
import {
  ringOpacity,
  ringScale,
  TINT_COLORS,
} from '../dashboard/src/spatial/convergence-finale';

test.describe('ConvergenceFinale R3F laws', () => {
  test('Law 1: ringOpacity is 0 when far from wave', () => {
    expect(ringOpacity(0, 4, 5)).toBe(0);
  });

  test('Law 2: ringOpacity is > 0 when near wave front', () => {
    expect(ringOpacity(0.5, 2, 5)).toBeGreaterThan(0);
  });

  test('Law 3: ringOpacity is in [0, 1]', () => {
    for (let progress = 0; progress <= 1; progress += 0.1) {
      for (let ring = 0; ring < 5; ring++) {
        const opacity = ringOpacity(progress, ring, 5);
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  test('Law 4: ringScale increases with ring index', () => {
    const s1 = ringScale(0.5, 0, 3.0);
    const s2 = ringScale(0.5, 2, 3.0);
    expect(s2).toBeGreaterThan(s1);
  });

  test('Law 5: ringScale increases with progress', () => {
    const early = ringScale(0.2, 1, 3.0);
    const late = ringScale(0.8, 1, 3.0);
    expect(late).toBeGreaterThan(early);
  });

  test('Law 6: ringScale is always positive', () => {
    expect(ringScale(0, 0, 3.0)).toBeGreaterThan(0);
  });

  test('Law 7: all tints have colors', () => {
    const tints = ['green', 'amber', 'neutral'] as const;
    tints.forEach((tint) => {
      expect(TINT_COLORS[tint]).toMatch(/^#/);
    });
  });

  test('Law 8: green tint is green', () => {
    expect(TINT_COLORS['green']).toBe('#22c55e');
  });

  test('Law 9: tints have distinct colors', () => {
    const colors = Object.values(TINT_COLORS);
    expect(new Set(colors).size).toBe(3);
  });
});
