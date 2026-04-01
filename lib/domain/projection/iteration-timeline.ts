/**
 * IterationTimeline — pure domain module for multi-iteration timeline.
 *
 * The iteration timeline is a horizontal visualization showing every
 * iteration as a segmented bar. Each segment represents one act,
 * color-coded by act identity. Overlaid data:
 *
 *   - Knowledge hit-rate bar per iteration (height ∝ rate)
 *   - Pass-rate spark line
 *   - Convergence velocity arrows (↑ improving, → flat, ↓ regressing)
 *   - Iteration boundary markers with duration labels
 *   - Auto-bookmark chips at notable events
 *
 * The timeline scrolls horizontally to accommodate arbitrary iterations.
 * Current iteration is always visible and right-aligned.
 *
 * Pure domain logic. No React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part IX: Iteration Timeline
 */

import type { FlywheelAct } from './scene-state-accumulator';
export type { FlywheelAct } from './scene-state-accumulator';

// ─── Types ───

/** Act color mapping (same palette as PlaybackScrubber). */
export const ACT_COLORS: Readonly<Record<FlywheelAct, string>> = {
  1: '#6366f1', // Indigo — Context Intake
  2: '#06b6d4', // Cyan — ARIA Discovery
  3: '#f59e0b', // Amber — Suite Slicing
  4: '#10b981', // Emerald — Deterministic Compile
  5: '#ef4444', // Red — Execution & Failure
  6: '#8b5cf6', // Violet — Trust Gating
  7: '#3b82f6', // Blue — Meta-Measurement
} as const;

/** Act display names. */
export const ACT_NAMES: Readonly<Record<FlywheelAct, string>> = {
  1: 'Intake',
  2: 'Capture',
  3: 'Slice',
  4: 'Compile',
  5: 'Execute',
  6: 'Gate',
  7: 'Measure',
} as const;

/** Time span of one act within an iteration. */
export interface ActSpan {
  readonly act: FlywheelAct;
  readonly startMs: number;      // Relative to iteration start
  readonly durationMs: number;
  readonly eventCount: number;
}

/** Metrics captured at each iteration boundary. */
export interface IterationMetrics {
  readonly iteration: number;
  readonly knowledgeHitRate: number;   // [0, 1]
  readonly passRate: number;           // [0, 1]
  readonly proposalsActivated: number;
  readonly proposalsPending: number;
  readonly durationMs: number;
  readonly actSpans: readonly ActSpan[];
}

/** Convergence velocity indicator. */
export type ConvergenceDirection = 'improving' | 'flat' | 'regressing';

/** Computed display data for one iteration in the timeline. */
export interface TimelineEntry {
  readonly iteration: number;
  readonly metrics: IterationMetrics;
  readonly convergenceDirection: ConvergenceDirection;
  readonly hitRateDelta: number;        // Change from previous
  readonly hitRateBarHeight: number;    // [0, 1] normalized
  readonly passRateBarHeight: number;   // [0, 1] normalized
  readonly segments: readonly TimelineSegment[];
  readonly totalWidthPx: number;        // Proportional to duration
}

/** A colored segment within an iteration bar. */
export interface TimelineSegment {
  readonly act: FlywheelAct;
  readonly color: string;
  readonly widthFraction: number; // [0, 1] within iteration
  readonly label: string;
}

/** Complete timeline state. */
export interface TimelineState {
  readonly entries: readonly TimelineEntry[];
  readonly currentIteration: number;
  readonly maxHitRate: number;
  readonly converged: boolean;
  readonly scrollOffsetPx: number;
}

// ─── Constants ───

/** Minimum pixel width per iteration bar. */
export const MIN_ITERATION_WIDTH_PX = 60;

/** Maximum pixel width per iteration bar. */
export const MAX_ITERATION_WIDTH_PX = 200;

/** Delta threshold for convergence direction. */
const DIRECTION_THRESHOLD = 0.02;

// ─── Timeline Construction ───

/**
 * Compute convergence direction from hit-rate delta.
 */
export function convergenceDirection(delta: number): ConvergenceDirection {
  if (delta > DIRECTION_THRESHOLD) return 'improving';
  if (delta < -DIRECTION_THRESHOLD) return 'regressing';
  return 'flat';
}

/**
 * Compute timeline segments from act spans.
 */
export function computeSegments(actSpans: readonly ActSpan[]): readonly TimelineSegment[] {
  const totalDuration = actSpans.reduce((sum, s) => sum + s.durationMs, 0);
  if (totalDuration === 0) return [];

  return actSpans.map((span) => ({
    act: span.act,
    color: ACT_COLORS[span.act],
    widthFraction: span.durationMs / totalDuration,
    label: ACT_NAMES[span.act],
  }));
}

/**
 * Build a single timeline entry from iteration metrics.
 *
 * @param metrics - Metrics for this iteration
 * @param previousHitRate - Hit rate from previous iteration (0 for first)
 * @param maxDurationMs - Maximum duration across all iterations (for width normalization)
 */
export function buildTimelineEntry(
  metrics: IterationMetrics,
  previousHitRate: number,
  maxDurationMs: number,
): TimelineEntry {
  const delta = metrics.knowledgeHitRate - previousHitRate;
  const widthRatio = maxDurationMs > 0
    ? metrics.durationMs / maxDurationMs
    : 1;
  const totalWidthPx = Math.max(
    MIN_ITERATION_WIDTH_PX,
    Math.min(MAX_ITERATION_WIDTH_PX, Math.round(widthRatio * MAX_ITERATION_WIDTH_PX)),
  );

  return {
    iteration: metrics.iteration,
    metrics,
    convergenceDirection: convergenceDirection(delta),
    hitRateDelta: delta,
    hitRateBarHeight: metrics.knowledgeHitRate,
    passRateBarHeight: metrics.passRate,
    segments: computeSegments(metrics.actSpans),
    totalWidthPx,
  };
}

/**
 * Build the complete timeline from an array of iteration metrics.
 */
export function buildTimeline(
  iterationMetrics: readonly IterationMetrics[],
  converged: boolean = false,
): TimelineState {
  if (iterationMetrics.length === 0) {
    return {
      entries: [],
      currentIteration: 0,
      maxHitRate: 0,
      converged,
      scrollOffsetPx: 0,
    };
  }

  const maxDuration = Math.max(...iterationMetrics.map((m) => m.durationMs));

  const entries = iterationMetrics.map((metrics, i) => {
    const prevHitRate = i > 0 ? iterationMetrics[i - 1]!.knowledgeHitRate : 0;
    return buildTimelineEntry(metrics, prevHitRate, maxDuration);
  });

  const maxHitRate = Math.max(...iterationMetrics.map((m) => m.knowledgeHitRate));
  const currentIteration = iterationMetrics[iterationMetrics.length - 1]!.iteration;

  // Auto-scroll to show current iteration
  const totalWidth = entries.reduce((sum, e) => sum + e.totalWidthPx, 0);

  return {
    entries,
    currentIteration,
    maxHitRate,
    converged,
    scrollOffsetPx: Math.max(0, totalWidth - 800), // 800px viewport
  };
}

/**
 * Add a new iteration to an existing timeline.
 */
export function appendIteration(
  state: TimelineState,
  metrics: IterationMetrics,
  converged: boolean = false,
): TimelineState {
  const allMetrics = [...state.entries.map((e) => e.metrics), metrics];
  return buildTimeline(allMetrics, converged);
}

/**
 * Get the direction arrow character for display.
 */
export function directionArrow(direction: ConvergenceDirection): string {
  switch (direction) {
    case 'improving':  return '↑';
    case 'flat':       return '→';
    case 'regressing': return '↓';
  }
}

/**
 * Get the direction color for display.
 */
export function directionColor(direction: ConvergenceDirection): string {
  switch (direction) {
    case 'improving':  return '#22c55e'; // Green
    case 'flat':       return '#f59e0b'; // Amber
    case 'regressing': return '#ef4444'; // Red
  }
}

/**
 * Compute the total timeline width in pixels.
 */
export function totalTimelineWidth(state: TimelineState): number {
  return state.entries.reduce((sum, e) => sum + e.totalWidthPx, 0);
}
