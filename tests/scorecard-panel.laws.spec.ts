import { expect, test } from '@playwright/test';
import {
  formatMetricValue,
  metricColor,
  scorecardHealth,
  type ScorecardMetric,
} from '../dashboard/src/spatial/scorecard-panel';

test.describe('ScorecardPanel3D laws', () => {
  test('Law 1: formatMetricValue percentage', () => {
    expect(formatMetricValue(0.85, '%')).toBe('85%');
  });

  test('Law 2: formatMetricValue count', () => {
    expect(formatMetricValue(42, 'count')).toBe('42');
  });

  test('Law 3: formatMetricValue milliseconds', () => {
    expect(formatMetricValue(1234, 'ms')).toBe('1234ms');
  });

  test('Law 4: formatMetricValue score', () => {
    expect(formatMetricValue(0.95, 'score')).toBe('0.95');
  });

  test('Law 5: metricColor green when at target', () => {
    expect(metricColor(1.0, 1.0)).toBe('#22c55e');
  });

  test('Law 6: metricColor amber when approaching', () => {
    expect(metricColor(0.8, 1.0)).toBe('#f59e0b');
  });

  test('Law 7: metricColor red when below target', () => {
    expect(metricColor(0.3, 1.0)).toBe('#ef4444');
  });

  test('Law 8: metricColor handles zero target', () => {
    expect(metricColor(0, 0)).toBe('#ef4444');
  });

  test('Law 9: scorecardHealth is 0 for empty', () => {
    expect(scorecardHealth([])).toBe(0);
  });

  test('Law 10: scorecardHealth is 1 when all met', () => {
    const metrics: ScorecardMetric[] = [
      { label: 'A', value: 1.0, target: 0.9, unit: '%' },
      { label: 'B', value: 50, target: 40, unit: 'count' },
    ];
    expect(scorecardHealth(metrics)).toBe(1);
  });

  test('Law 11: scorecardHealth is fraction', () => {
    const metrics: ScorecardMetric[] = [
      { label: 'A', value: 1.0, target: 0.9, unit: '%' },
      { label: 'B', value: 10, target: 40, unit: 'count' },
    ];
    expect(scorecardHealth(metrics)).toBe(0.5);
  });

  test('Law 12: scorecardHealth is in [0, 1]', () => {
    const metrics: ScorecardMetric[] = [
      { label: 'A', value: 0.5, target: 0.9, unit: '%' },
      { label: 'B', value: 50, target: 40, unit: 'count' },
      { label: 'C', value: 100, target: 200, unit: 'ms' },
    ];
    const health = scorecardHealth(metrics);
    expect(health).toBeGreaterThanOrEqual(0);
    expect(health).toBeLessThanOrEqual(1);
  });
});
