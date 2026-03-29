import { expect, test } from '@playwright/test';
import {
  rungColor,
  cardOpacity,
  isCardVisible,
  RUNG_CARD_COLORS,
} from '../dashboard/src/spatial/probe-data-card';

test.describe('ProbeDataCard laws', () => {
  test('Law 1: all rungs have colors', () => {
    const rungs = ['getByRole', 'getByLabel', 'getByPlaceholder', 'getByText', 'getByTestId', 'css', 'xpath', 'needs-human'];
    rungs.forEach((rung) => {
      expect(rungColor(rung)).toMatch(/^#/);
    });
  });

  test('Law 2: unknown rung returns white', () => {
    expect(rungColor('unknown')).toBe('#ffffff');
  });

  test('Law 3: cardOpacity is 1 during display window', () => {
    expect(cardOpacity(1.0, 3.0, 0.5)).toBe(1);
  });

  test('Law 4: cardOpacity is 0 after total duration', () => {
    expect(cardOpacity(4.0, 3.0, 0.5)).toBe(0);
  });

  test('Law 5: cardOpacity fades during fade window', () => {
    const opacity = cardOpacity(3.25, 3.0, 0.5);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
  });

  test('Law 6: cardOpacity is 0 before spawn', () => {
    expect(cardOpacity(-1, 3.0, 0.5)).toBe(0);
  });

  test('Law 7: isCardVisible during display', () => {
    expect(isCardVisible(1.0, 3.0, 0.5)).toBe(true);
  });

  test('Law 8: isCardVisible during fade', () => {
    expect(isCardVisible(3.3, 3.0, 0.5)).toBe(true);
  });

  test('Law 9: isCardVisible false after total', () => {
    expect(isCardVisible(4.0, 3.0, 0.5)).toBe(false);
  });

  test('Law 10: cardOpacity at boundary is exact', () => {
    expect(cardOpacity(3.0, 3.0, 0.5)).toBe(1);
    expect(cardOpacity(3.5, 3.0, 0.5)).toBe(0);
  });

  test('Law 11: rungColor is deterministic', () => {
    expect(rungColor('getByRole')).toBe(rungColor('getByRole'));
  });

  test('Law 12: all rung colors are distinct', () => {
    const colors = Object.values(RUNG_CARD_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
