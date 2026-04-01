import { expect, test } from '@playwright/test';
import {
  formatNodeCount,
  formatConfidence,
  formatGrowth,
  formatConfidenceGrowth,
  growthColor,
  prepareComparisonView,
  computeGrowthSummary,
} from '../dashboard/src/organisms/before-after-comparison';
import type { BeforeAfterComparison as ComparisonData } from '../lib/domain/projection/summary-view';

const COMPARISON: ComparisonData = {
  before: { nodeCount: 3, approvedCount: 0, learningCount: 3, blockedCount: 0, avgConfidence: 0.3, screenCount: 1 },
  after: { nodeCount: 50, approvedCount: 40, learningCount: 8, blockedCount: 2, avgConfidence: 0.85, screenCount: 5 },
  nodeGrowth: 47,
  confidenceGrowth: 0.55,
  screenGrowth: 4,
};

test.describe('BeforeAfterComparison laws', () => {

  test('Law 1: formatNodeCount handles zero', () => {
    expect(formatNodeCount(0)).toBe('Empty');
  });

  test('Law 2: formatNodeCount handles singular', () => {
    expect(formatNodeCount(1)).toBe('1 node');
  });

  test('Law 3: formatNodeCount handles plural', () => {
    expect(formatNodeCount(50)).toBe('50 nodes');
  });

  test('Law 4: formatConfidence formats as percentage', () => {
    expect(formatConfidence(0.85)).toBe('85%');
    expect(formatConfidence(0)).toBe('0%');
    expect(formatConfidence(1)).toBe('100%');
  });

  test('Law 5: formatGrowth shows + prefix for positive', () => {
    expect(formatGrowth(47)).toBe('+47');
    expect(formatGrowth(-3)).toBe('-3');
    expect(formatGrowth(0)).toBe('0');
  });

  test('Law 6: formatConfidenceGrowth shows percentage points', () => {
    expect(formatConfidenceGrowth(0.55)).toBe('+55pp');
    expect(formatConfidenceGrowth(-0.1)).toBe('-10pp');
  });

  test('Law 7: growthColor is green for positive, red for negative', () => {
    expect(growthColor(10)).toBe('#22c55e');
    expect(growthColor(-5)).toBe('#ef4444');
    expect(growthColor(0)).toBe('#9ca3af');
  });

  test('Law 8: prepareComparisonView creates before and after halves', () => {
    const view = prepareComparisonView(COMPARISON);
    expect(view.before.label).toBe('Iteration 1 Start');
    expect(view.after.label).toBe('Converged State');
    expect(view.before.tint).toBe('sparse');
    expect(view.after.tint).toBe('dense');
    expect(view.before.opacity).toBeLessThan(view.after.opacity);
  });

  test('Law 9: prepareComparisonView preserves node counts', () => {
    const view = prepareComparisonView(COMPARISON);
    expect(view.before.nodeCount).toBe(3);
    expect(view.after.nodeCount).toBe(50);
  });

  test('Law 10: computeGrowthSummary includes all growth metrics', () => {
    const growth = computeGrowthSummary(COMPARISON);
    expect(growth.nodeGrowth).toBe(47);
    expect(growth.nodeGrowthLabel).toBe('+47');
    expect(growth.confidenceGrowth).toBeCloseTo(0.55);
    expect(growth.confidenceGrowthLabel).toBe('+55pp');
    expect(growth.screenGrowth).toBe(4);
    expect(growth.screenGrowthLabel).toBe('+4');
  });

  test('Law 11: computeGrowthSummary uses correct colors', () => {
    const growth = computeGrowthSummary(COMPARISON);
    expect(growth.nodeColor).toBe('#22c55e');
    expect(growth.confidenceColor).toBe('#22c55e');
    expect(growth.screenColor).toBe('#22c55e');
  });

  test('Law 12: negative growth shows red in summary', () => {
    const negative: ComparisonData = {
      before: { nodeCount: 50, approvedCount: 40, learningCount: 8, blockedCount: 2, avgConfidence: 0.85, screenCount: 5 },
      after: { nodeCount: 30, approvedCount: 20, learningCount: 8, blockedCount: 2, avgConfidence: 0.6, screenCount: 4 },
      nodeGrowth: -20,
      confidenceGrowth: -0.25,
      screenGrowth: -1,
    };
    const growth = computeGrowthSummary(negative);
    expect(growth.nodeColor).toBe('#ef4444');
    expect(growth.confidenceColor).toBe('#ef4444');
  });
});
