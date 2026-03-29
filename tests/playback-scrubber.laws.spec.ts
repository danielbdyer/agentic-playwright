import { expect, test } from '@playwright/test';
import {
  ACT_COLORS,
  ACT_LABELS,
  formatDuration,
  mouseToFraction,
  findActAtFraction,
  type ActSegment,
} from '../dashboard/src/organisms/playback-scrubber';

const SAMPLE_SEGMENTS: readonly ActSegment[] = [
  { act: 1, startFraction: 0.00, endFraction: 0.05, label: 'Intake' },
  { act: 2, startFraction: 0.05, endFraction: 0.20, label: 'Capture' },
  { act: 3, startFraction: 0.20, endFraction: 0.30, label: 'Slice' },
  { act: 4, startFraction: 0.30, endFraction: 0.50, label: 'Compile' },
  { act: 5, startFraction: 0.50, endFraction: 0.80, label: 'Execute' },
  { act: 6, startFraction: 0.80, endFraction: 0.90, label: 'Gate' },
  { act: 7, startFraction: 0.90, endFraction: 1.00, label: 'Measure' },
];

test.describe('PlaybackScrubber laws', () => {

  test('Law 1: all 7 acts have unique colors', () => {
    const colors = new Set(Object.values(ACT_COLORS));
    expect(colors.size).toBe(7);
  });

  test('Law 2: all 7 acts have labels', () => {
    for (let i = 1; i <= 7; i++) {
      expect(ACT_LABELS[i as 1]).toBeTruthy();
    }
  });

  test('Law 3: formatDuration handles zero', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  test('Law 4: formatDuration formats seconds', () => {
    expect(formatDuration(5000)).toBe('0:05');
    expect(formatDuration(65000)).toBe('1:05');
  });

  test('Law 5: formatDuration formats hours', () => {
    expect(formatDuration(3661000)).toBe('1:01:01');
  });

  test('Law 6: mouseToFraction clamps to [0, 1]', () => {
    const rect = { left: 100, width: 200, top: 0, bottom: 0, height: 0, right: 300, x: 100, y: 0, toJSON: () => ({}) } as DOMRect;
    expect(mouseToFraction(50, rect)).toBe(0);   // Before left edge
    expect(mouseToFraction(200, rect)).toBe(0.5); // Middle
    expect(mouseToFraction(400, rect)).toBe(1);   // Past right edge
  });

  test('Law 7: findActAtFraction returns correct segment', () => {
    expect(findActAtFraction(SAMPLE_SEGMENTS, 0.02)?.act).toBe(1);
    expect(findActAtFraction(SAMPLE_SEGMENTS, 0.15)?.act).toBe(2);
    expect(findActAtFraction(SAMPLE_SEGMENTS, 0.75)?.act).toBe(5);
    expect(findActAtFraction(SAMPLE_SEGMENTS, 0.95)?.act).toBe(7);
  });

  test('Law 8: findActAtFraction returns null for gap (if any)', () => {
    // Segments are contiguous so there should be no gap — verify full coverage
    const allFractions = [0.0, 0.1, 0.25, 0.4, 0.6, 0.85, 0.99];
    allFractions.forEach((f) => {
      expect(findActAtFraction(SAMPLE_SEGMENTS, f)).not.toBeNull();
    });
  });

  test('Law 9: segment fractions span [0, 1] without overlap for sample data', () => {
    expect(SAMPLE_SEGMENTS[0]!.startFraction).toBe(0);
    expect(SAMPLE_SEGMENTS[SAMPLE_SEGMENTS.length - 1]!.endFraction).toBe(1);
    for (let i = 1; i < SAMPLE_SEGMENTS.length; i++) {
      expect(SAMPLE_SEGMENTS[i]!.startFraction).toBe(SAMPLE_SEGMENTS[i - 1]!.endFraction);
    }
  });
});
