import { expect, test } from '@playwright/test';
import { computeTempoProfile, adaptTimeout, mergeTempoProfiles } from '../lib/domain/execution-tempo';

// ─── computeTempoProfile laws ───

test('single duration → p50 = p95 = that value', () => {
  const profile = computeTempoProfile('screen-a', [200], '2026-01-01T00:00:00Z');
  expect(profile.p50Ms).toBe(200);
  expect(profile.p95Ms).toBe(200);
  expect(profile.sampleCount).toBe(1);
  expect(profile.recommendedTimeoutMs).toBe(Math.round(200 * 1.5));
});

test('sorted durations → correct percentiles', () => {
  // 20 values from 100 to 2000, step 100
  const durations = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
  const profile = computeTempoProfile('screen-b', durations, '2026-01-01T00:00:00Z');

  // p50 of 1..20 at index 9.5 → interpolation between 1000 and 1100
  expect(profile.p50Ms).toBe(1050);
  // p95 at index 18.05 → interpolation: 1900 * 0.95 + 2000 * 0.05 = 1905
  expect(profile.p95Ms).toBeCloseTo(1905, 0);
  expect(profile.sampleCount).toBe(20);
});

test('empty durations → sensible defaults', () => {
  const profile = computeTempoProfile('screen-empty', [], '2026-01-01T00:00:00Z');
  expect(profile.p50Ms).toBe(0);
  expect(profile.p95Ms).toBe(0);
  expect(profile.recommendedTimeoutMs).toBe(0);
  expect(profile.sampleCount).toBe(0);
});

test('unsorted input is sorted in output', () => {
  const profile = computeTempoProfile('screen-c', [500, 100, 300, 200, 400], '2026-01-01T00:00:00Z');
  expect(profile.observedDurationsMs).toEqual([100, 200, 300, 400, 500]);
});

test('recommended timeout = p95 * 1.5 (default headroom)', () => {
  const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  const profile = computeTempoProfile('screen-d', durations, '2026-01-01T00:00:00Z');
  expect(profile.recommendedTimeoutMs).toBe(Math.round(profile.p95Ms * 1.5));
});

// ─── adaptTimeout laws ───

test('adaptive timeout lowers when screen is fast', () => {
  const profile = computeTempoProfile('fast-screen', [50, 60, 55, 58, 52, 61, 53, 57, 54, 59], '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000);
  expect(result.adaptedTimeoutMs).toBeLessThan(result.previousTimeoutMs);
  expect(result.reason).toContain('lowering');
});

test('adaptive timeout raises when screen is slow', () => {
  const profile = computeTempoProfile('slow-screen', [5000, 8000, 6000, 7000, 9000, 8500, 7500, 6500, 9500, 10000], '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 5000);
  expect(result.adaptedTimeoutMs).toBeGreaterThan(result.previousTimeoutMs);
  expect(result.reason).toContain('raising');
});

test('adaptive timeout respects min bound', () => {
  const profile = computeTempoProfile('tiny-screen', [10, 15, 12, 11, 13], '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000, { minTimeoutMs: 2000 });
  expect(result.adaptedTimeoutMs).toBeGreaterThanOrEqual(2000);
});

test('adaptive timeout respects max bound', () => {
  const profile = computeTempoProfile('huge-screen', [80000, 90000, 85000, 95000, 100000], '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000, { maxTimeoutMs: 60000 });
  expect(result.adaptedTimeoutMs).toBeLessThanOrEqual(60000);
});

test('no change when timeout matches observed tempo', () => {
  const profile = computeTempoProfile('stable-screen', [1000, 1000, 1000, 1000, 1000], '2026-01-01T00:00:00Z');
  const target = Math.round(profile.p95Ms * 1.5);
  const result = adaptTimeout(profile, target);
  expect(result.adaptedTimeoutMs).toBe(target);
  expect(result.reason).toContain('no change');
});

test('no observations → keeps current timeout with low confidence', () => {
  const profile = computeTempoProfile('empty-screen', [], '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 10000);
  expect(result.adaptedTimeoutMs).toBe(10000);
  expect(result.confidence).toBe('low');
});

// ─── Confidence thresholds ───

test('confidence is high with >= 10 samples', () => {
  const durations = Array.from({ length: 10 }, (_, i) => 100 + i * 10);
  const profile = computeTempoProfile('s1', durations, '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000);
  expect(result.confidence).toBe('high');
});

test('confidence is medium with >= 5 and < 10 samples', () => {
  const durations = Array.from({ length: 7 }, (_, i) => 100 + i * 10);
  const profile = computeTempoProfile('s2', durations, '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000);
  expect(result.confidence).toBe('medium');
});

test('confidence is low with < 5 samples', () => {
  const durations = [100, 200, 300];
  const profile = computeTempoProfile('s3', durations, '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000);
  expect(result.confidence).toBe('low');
});

// ─── mergeTempoProfiles laws ───

test('merge combines observations', () => {
  const existing = computeTempoProfile('screen-m', [100, 200, 300], '2026-01-01T00:00:00Z');
  const merged = mergeTempoProfiles(existing, [400, 500], '2026-01-02T00:00:00Z');
  expect(merged.sampleCount).toBe(5);
  expect(merged.lastUpdated).toBe('2026-01-02T00:00:00Z');
  expect(merged.observedDurationsMs).toEqual([100, 200, 300, 400, 500]);
});

test('merge preserves sliding window cap of 50', () => {
  const durations = Array.from({ length: 45 }, (_, i) => i + 1);
  const existing = computeTempoProfile('screen-cap', durations, '2026-01-01T00:00:00Z');
  const newDurations = Array.from({ length: 20 }, (_, i) => 100 + i);
  const merged = mergeTempoProfiles(existing, newDurations, '2026-01-02T00:00:00Z');
  expect(merged.sampleCount).toBe(50);
  expect(merged.observedDurationsMs.length).toBe(50);
});

test('merge with empty new durations preserves existing', () => {
  const existing = computeTempoProfile('screen-noop', [100, 200], '2026-01-01T00:00:00Z');
  const merged = mergeTempoProfiles(existing, [], '2026-01-02T00:00:00Z');
  expect(merged.sampleCount).toBe(2);
  expect(merged.lastUpdated).toBe('2026-01-02T00:00:00Z');
});

// ─── Custom headroom factor ───

test('adaptTimeout respects custom headroom factor', () => {
  const durations = Array.from({ length: 10 }, () => 1000);
  const profile = computeTempoProfile('custom-headroom', durations, '2026-01-01T00:00:00Z');
  const result = adaptTimeout(profile, 30_000, { headroomFactor: 2.0 });
  expect(result.adaptedTimeoutMs).toBe(2000);
});
