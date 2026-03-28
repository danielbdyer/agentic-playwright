import type { ScreenTempoProfile, TempoAdaptationResult } from './types/execution';

// ─── Constants ───

const DEFAULT_HEADROOM_FACTOR = 1.5;
const DEFAULT_MIN_TIMEOUT_MS = 1000;
const DEFAULT_MAX_TIMEOUT_MS = 120_000;
const SLIDING_WINDOW_CAP = 50;
const HIGH_CONFIDENCE_THRESHOLD = 10;
const MEDIUM_CONFIDENCE_THRESHOLD = 5;
const MINIMUM_MEANINGFUL_SAMPLES = 3;

// ─── Helpers ───

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] as number;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerVal = sorted[lower] as number;
  const upperVal = sorted[upper] as number;
  if (lower === upper) return lowerVal;
  const fraction = index - lower;
  return lowerVal * (1 - fraction) + upperVal * fraction;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function confidenceFromSampleCount(count: number): 'high' | 'medium' | 'low' {
  return count >= HIGH_CONFIDENCE_THRESHOLD
    ? 'high'
    : count >= MEDIUM_CONFIDENCE_THRESHOLD
      ? 'medium'
      : 'low';
}

// ─── Public API ───

export function computeTempoProfile(
  screenId: string,
  durations: readonly number[],
  now: string,
): ScreenTempoProfile {
  const sorted = [...durations].sort((a, b) => a - b);
  const sampleCount = sorted.length;

  if (sampleCount === 0) {
    return {
      screenId,
      observedDurationsMs: [],
      p50Ms: 0,
      p95Ms: 0,
      recommendedTimeoutMs: 0,
      sampleCount: 0,
      lastUpdated: now,
    };
  }

  const p50Ms = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const recommendedTimeoutMs = sampleCount >= MINIMUM_MEANINGFUL_SAMPLES
    ? Math.round(p95Ms * DEFAULT_HEADROOM_FACTOR)
    : Math.round(p95Ms * DEFAULT_HEADROOM_FACTOR);

  return {
    screenId,
    observedDurationsMs: sorted,
    p50Ms,
    p95Ms,
    recommendedTimeoutMs,
    sampleCount,
    lastUpdated: now,
  };
}

export function adaptTimeout(
  profile: ScreenTempoProfile,
  currentTimeoutMs: number,
  options?: {
    readonly minTimeoutMs?: number;
    readonly maxTimeoutMs?: number;
    readonly headroomFactor?: number;
  },
): TempoAdaptationResult {
  const minTimeout = options?.minTimeoutMs ?? DEFAULT_MIN_TIMEOUT_MS;
  const maxTimeout = options?.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
  const headroom = options?.headroomFactor ?? DEFAULT_HEADROOM_FACTOR;

  if (profile.sampleCount === 0) {
    return {
      screenId: profile.screenId,
      previousTimeoutMs: currentTimeoutMs,
      adaptedTimeoutMs: currentTimeoutMs,
      confidence: 'low',
      reason: 'No observations available; keeping current timeout.',
    };
  }

  const target = Math.round(profile.p95Ms * headroom);
  const clamped = clamp(target, minTimeout, maxTimeout);
  const confidence = confidenceFromSampleCount(profile.sampleCount);

  const reason = clamped < currentTimeoutMs
    ? `Screen responds faster than current timeout (p95=${Math.round(profile.p95Ms)}ms); lowering to ${clamped}ms.`
    : clamped > currentTimeoutMs
      ? `Screen is slower than current timeout (p95=${Math.round(profile.p95Ms)}ms); raising to ${clamped}ms.`
      : `Current timeout matches observed tempo (p95=${Math.round(profile.p95Ms)}ms); no change needed.`;

  return {
    screenId: profile.screenId,
    previousTimeoutMs: currentTimeoutMs,
    adaptedTimeoutMs: clamped,
    confidence,
    reason,
  };
}

export function mergeTempoProfiles(
  existing: ScreenTempoProfile,
  newDurations: readonly number[],
  now: string,
): ScreenTempoProfile {
  const combined = [...existing.observedDurationsMs, ...newDurations];
  const trimmed = combined.length > SLIDING_WINDOW_CAP
    ? combined.slice(combined.length - SLIDING_WINDOW_CAP)
    : combined;
  return computeTempoProfile(existing.screenId, trimmed, now);
}
