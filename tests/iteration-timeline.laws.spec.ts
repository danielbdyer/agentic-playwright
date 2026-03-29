import { expect, test } from '@playwright/test';
import {
  ACT_COLORS,
  ACT_NAMES,
  convergenceDirection,
  computeSegments,
  buildTimelineEntry,
  buildTimeline,
  appendIteration,
  directionArrow,
  directionColor,
  totalTimelineWidth,
  MIN_ITERATION_WIDTH_PX,
  MAX_ITERATION_WIDTH_PX,
  type IterationMetrics,
  type FlywheelAct,
} from '../lib/domain/iteration-timeline';

const sampleMetrics = (iteration: number, hitRate: number, durationMs: number = 5000): IterationMetrics => ({
  iteration,
  knowledgeHitRate: hitRate,
  passRate: hitRate * 0.8,
  proposalsActivated: 3,
  proposalsPending: 1,
  durationMs,
  actSpans: [
    { act: 4 as FlywheelAct, startMs: 0, durationMs: 2000, eventCount: 20 },
    { act: 5 as FlywheelAct, startMs: 2000, durationMs: 2000, eventCount: 30 },
    { act: 6 as FlywheelAct, startMs: 4000, durationMs: 500, eventCount: 5 },
    { act: 7 as FlywheelAct, startMs: 4500, durationMs: 500, eventCount: 10 },
  ],
});

test.describe('IterationTimeline laws', () => {

  test('Law 1: all 7 acts have colors', () => {
    ([1, 2, 3, 4, 5, 6, 7] as const).forEach((act) => {
      expect(ACT_COLORS[act]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('Law 2: all 7 acts have display names', () => {
    ([1, 2, 3, 4, 5, 6, 7] as const).forEach((act) => {
      expect(ACT_NAMES[act].length).toBeGreaterThan(0);
    });
  });

  test('Law 3: convergenceDirection classifies positive delta as improving', () => {
    expect(convergenceDirection(0.05)).toBe('improving');
  });

  test('Law 4: convergenceDirection classifies negative delta as regressing', () => {
    expect(convergenceDirection(-0.05)).toBe('regressing');
  });

  test('Law 5: convergenceDirection classifies small delta as flat', () => {
    expect(convergenceDirection(0.01)).toBe('flat');
    expect(convergenceDirection(-0.01)).toBe('flat');
  });

  test('Law 6: computeSegments width fractions sum to 1', () => {
    const metrics = sampleMetrics(1, 0.5);
    const segments = computeSegments(metrics.actSpans);
    const totalWidth = segments.reduce((sum, s) => sum + s.widthFraction, 0);
    expect(totalWidth).toBeCloseTo(1.0, 5);
  });

  test('Law 7: computeSegments preserves act colors', () => {
    const metrics = sampleMetrics(1, 0.5);
    const segments = computeSegments(metrics.actSpans);
    segments.forEach((seg) => {
      expect(seg.color).toBe(ACT_COLORS[seg.act]);
    });
  });

  test('Law 8: buildTimelineEntry computes hit rate delta', () => {
    const entry = buildTimelineEntry(sampleMetrics(2, 0.6), 0.4, 5000);
    expect(entry.hitRateDelta).toBeCloseTo(0.2, 5);
    expect(entry.convergenceDirection).toBe('improving');
  });

  test('Law 9: buildTimelineEntry width is between min and max', () => {
    const entry = buildTimelineEntry(sampleMetrics(1, 0.5), 0, 5000);
    expect(entry.totalWidthPx).toBeGreaterThanOrEqual(MIN_ITERATION_WIDTH_PX);
    expect(entry.totalWidthPx).toBeLessThanOrEqual(MAX_ITERATION_WIDTH_PX);
  });

  test('Law 10: buildTimeline produces entries for each iteration', () => {
    const metrics = [sampleMetrics(1, 0.3), sampleMetrics(2, 0.5), sampleMetrics(3, 0.7)];
    const timeline = buildTimeline(metrics);
    expect(timeline.entries).toHaveLength(3);
    expect(timeline.currentIteration).toBe(3);
  });

  test('Law 11: buildTimeline tracks maxHitRate', () => {
    const metrics = [sampleMetrics(1, 0.3), sampleMetrics(2, 0.8)];
    const timeline = buildTimeline(metrics);
    expect(timeline.maxHitRate).toBe(0.8);
  });

  test('Law 12: buildTimeline for empty returns empty entries', () => {
    const timeline = buildTimeline([]);
    expect(timeline.entries).toHaveLength(0);
    expect(timeline.currentIteration).toBe(0);
  });

  test('Law 13: appendIteration adds to existing timeline', () => {
    const timeline = buildTimeline([sampleMetrics(1, 0.3)]);
    const appended = appendIteration(timeline, sampleMetrics(2, 0.6));
    expect(appended.entries).toHaveLength(2);
    expect(appended.currentIteration).toBe(2);
  });

  test('Law 14: directionArrow returns arrow characters', () => {
    expect(directionArrow('improving')).toBe('↑');
    expect(directionArrow('flat')).toBe('→');
    expect(directionArrow('regressing')).toBe('↓');
  });

  test('Law 15: directionColor returns hex colors', () => {
    expect(directionColor('improving')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(directionColor('flat')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(directionColor('regressing')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('Law 16: totalTimelineWidth sums all entry widths', () => {
    const timeline = buildTimeline([sampleMetrics(1, 0.3), sampleMetrics(2, 0.5)]);
    const total = totalTimelineWidth(timeline);
    const expected = timeline.entries.reduce((sum, e) => sum + e.totalWidthPx, 0);
    expect(total).toBe(expected);
  });

  test('Law 17: first iteration always has hitRateDelta equal to its own rate', () => {
    const timeline = buildTimeline([sampleMetrics(1, 0.4)]);
    expect(timeline.entries[0]!.hitRateDelta).toBeCloseTo(0.4, 5);
  });

  test('Law 18: computeSegments returns empty for empty actSpans', () => {
    const segments = computeSegments([]);
    expect(segments).toHaveLength(0);
  });
});
