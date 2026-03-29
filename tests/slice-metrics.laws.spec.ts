import { expect, test } from '@playwright/test';
import {
  selectionRatio,
  formatPercent,
  type SliceMetricsData,
} from '../dashboard/src/molecules/slice-metrics';

test.describe('SliceMetrics laws', () => {
  const FULL: SliceMetricsData = { totalScenarios: 20, selectedCount: 15, deferredCount: 5, selectionReason: 'priority' };
  const EMPTY: SliceMetricsData = { totalScenarios: 0, selectedCount: 0, deferredCount: 0, selectionReason: '' };
  const ALL: SliceMetricsData = { totalScenarios: 10, selectedCount: 10, deferredCount: 0, selectionReason: 'all' };

  test('Law 1: selectionRatio is in [0, 1]', () => {
    expect(selectionRatio(FULL)).toBeGreaterThanOrEqual(0);
    expect(selectionRatio(FULL)).toBeLessThanOrEqual(1);
  });

  test('Law 2: selectionRatio is 0 for empty', () => {
    expect(selectionRatio(EMPTY)).toBe(0);
  });

  test('Law 3: selectionRatio is 1 for all selected', () => {
    expect(selectionRatio(ALL)).toBe(1);
  });

  test('Law 4: selectionRatio = selected / total', () => {
    expect(selectionRatio(FULL)).toBeCloseTo(0.75, 10);
  });

  test('Law 5: formatPercent rounds to nearest integer', () => {
    expect(formatPercent(0.756)).toBe('76%');
  });

  test('Law 6: formatPercent handles 0', () => {
    expect(formatPercent(0)).toBe('0%');
  });

  test('Law 7: formatPercent handles 1', () => {
    expect(formatPercent(1)).toBe('100%');
  });

  test('Law 8: selected + deferred = total', () => {
    expect(FULL.selectedCount + FULL.deferredCount).toBe(FULL.totalScenarios);
  });
});
