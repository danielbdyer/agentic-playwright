import { expect, test } from '@playwright/test';
import {
  formatDelta,
} from '../../dashboard/src/molecules/convergence-arrow';
import {
  directionArrow,
  directionColor,
} from '../../lib/domain/projection/iteration-timeline';

test.describe('ConvergenceArrow laws', () => {
  test('Law 1: improving arrow is ↑', () => {
    expect(directionArrow('improving')).toBe('↑');
  });

  test('Law 2: flat arrow is →', () => {
    expect(directionArrow('flat')).toBe('→');
  });

  test('Law 3: regressing arrow is ↓', () => {
    expect(directionArrow('regressing')).toBe('↓');
  });

  test('Law 4: improving color is green', () => {
    expect(directionColor('improving')).toMatch(/^#/);
  });

  test('Law 5: regressing color is red', () => {
    expect(directionColor('regressing')).toMatch(/^#/);
  });

  test('Law 6: all three directions have distinct colors', () => {
    const colors = (['improving', 'flat', 'regressing'] as const).map(directionColor);
    const unique = new Set(colors);
    expect(unique.size).toBe(3);
  });

  test('Law 7: formatDelta positive shows +', () => {
    expect(formatDelta(0.05)).toBe('+5%');
  });

  test('Law 8: formatDelta negative shows -', () => {
    expect(formatDelta(-0.03)).toBe('-3%');
  });

  test('Law 9: formatDelta zero shows 0%', () => {
    expect(formatDelta(0)).toBe('0%');
  });

  test('Law 10: formatDelta rounds to integer', () => {
    expect(formatDelta(0.123)).toBe('+12%');
  });
});
