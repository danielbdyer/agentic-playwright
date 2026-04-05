/**
 * BeforeAfterComparison — split-view knowledge observatory comparison.
 *
 * The "Before and After" toggle in the summary view splits:
 *   - Left half: Observatory at iteration 1 start (empty/sparse)
 *   - Right half: Observatory in final converged state (dense, crystallized)
 *
 * This is the image that communicates Tesseract's value in one screenshot.
 *
 * Architecture:
 *   - Pure domain functions compute before/after snapshots from event journal
 *   - React component renders the split view with responsive layout
 *   - Each half shows: node count badge, confidence meter, screen list
 *   - Growth delta shown between the two halves
 *
 * @see docs/first-day-flywheel-visualization.md Part IX: Before and After Comparison
 */

import {
  computeObservatorySnapshot,
  computeBeforeAfterComparison,
  type ObservatorySnapshot,
  type BeforeAfterComparison as BeforeAfterComparisonData,
} from '../../../lib/domain/observation/contracts';
import type { SceneState } from '../../../lib/domain/observation/contracts';

// ─── Domain Logic ───

/** Extract the "before" snapshot from the first iteration's start state. */
export function extractBeforeSnapshot(
  firstIterationState: SceneState,
): ObservatorySnapshot {
  return computeObservatorySnapshot(firstIterationState.knowledgeNodes);
}

/** Extract the "after" snapshot from the final converged state. */
export function extractAfterSnapshot(
  finalState: SceneState,
): ObservatorySnapshot {
  return computeObservatorySnapshot(finalState.knowledgeNodes);
}

/**
 * Build the complete before/after comparison from first and final states.
 *
 * @param firstState Scene state at iteration 1 start
 * @param finalState Scene state at convergence
 * @returns Comparison data with growth deltas
 */
export function buildComparison(
  firstState: SceneState,
  finalState: SceneState,
): BeforeAfterComparisonData {
  const before = extractBeforeSnapshot(firstState);
  const after = extractAfterSnapshot(finalState);
  return computeBeforeAfterComparison(before, after);
}

// ─── Display Helpers ───

/** Format a node count with a descriptive label. */
export function formatNodeCount(count: number): string {
  if (count === 0) return 'Empty';
  if (count === 1) return '1 node';
  return `${count} nodes`;
}

/** Format a confidence as a percentage. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** Format a growth delta with + prefix. */
export function formatGrowth(delta: number): string {
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${delta}`;
}

/** Format a confidence growth as percentage points. */
export function formatConfidenceGrowth(delta: number): string {
  const prefix = delta > 0 ? '+' : '';
  const points = Math.round(delta * 100);
  return `${prefix}${points}pp`;
}

/** Color for a growth indicator. */
export function growthColor(delta: number): string {
  if (delta > 0) return '#22c55e'; // Green
  if (delta < 0) return '#ef4444'; // Red
  return '#9ca3af'; // Gray
}

// ─── Comparison View Data ───

/** Pre-computed data for rendering one half of the comparison. */
export interface ComparisonHalf {
  readonly label: string;
  readonly nodeCount: number;
  readonly nodeCountLabel: string;
  readonly approvedCount: number;
  readonly learningCount: number;
  readonly blockedCount: number;
  readonly avgConfidence: number;
  readonly avgConfidenceLabel: string;
  readonly screenCount: number;
  readonly tint: 'sparse' | 'dense';
  /** Opacity for the observatory minimap (sparse=dim, dense=bright). */
  readonly opacity: number;
}

/** Prepare the comparison data for rendering. */
export function prepareComparisonView(
  comparison: BeforeAfterComparisonData,
): { readonly before: ComparisonHalf; readonly after: ComparisonHalf } {
  return {
    before: {
      label: 'Iteration 1 Start',
      nodeCount: comparison.before.nodeCount,
      nodeCountLabel: formatNodeCount(comparison.before.nodeCount),
      approvedCount: comparison.before.approvedCount,
      learningCount: comparison.before.learningCount,
      blockedCount: comparison.before.blockedCount,
      avgConfidence: comparison.before.avgConfidence,
      avgConfidenceLabel: formatConfidence(comparison.before.avgConfidence),
      screenCount: comparison.before.screenCount,
      tint: 'sparse',
      opacity: 0.3,
    },
    after: {
      label: 'Converged State',
      nodeCount: comparison.after.nodeCount,
      nodeCountLabel: formatNodeCount(comparison.after.nodeCount),
      approvedCount: comparison.after.approvedCount,
      learningCount: comparison.after.learningCount,
      blockedCount: comparison.after.blockedCount,
      avgConfidence: comparison.after.avgConfidence,
      avgConfidenceLabel: formatConfidence(comparison.after.avgConfidence),
      screenCount: comparison.after.screenCount,
      tint: 'dense',
      opacity: 1.0,
    },
  };
}

/** Compute the growth summary between before and after. */
export interface GrowthSummary {
  readonly nodeGrowth: number;
  readonly nodeGrowthLabel: string;
  readonly confidenceGrowth: number;
  readonly confidenceGrowthLabel: string;
  readonly screenGrowth: number;
  readonly screenGrowthLabel: string;
  readonly approvedGrowth: number;
  readonly nodeColor: string;
  readonly confidenceColor: string;
  readonly screenColor: string;
}

export function computeGrowthSummary(
  comparison: BeforeAfterComparisonData,
): GrowthSummary {
  return {
    nodeGrowth: comparison.nodeGrowth,
    nodeGrowthLabel: formatGrowth(comparison.nodeGrowth),
    confidenceGrowth: comparison.confidenceGrowth,
    confidenceGrowthLabel: formatConfidenceGrowth(comparison.confidenceGrowth),
    screenGrowth: comparison.screenGrowth,
    screenGrowthLabel: formatGrowth(comparison.screenGrowth),
    approvedGrowth: comparison.after.approvedCount - comparison.before.approvedCount,
    nodeColor: growthColor(comparison.nodeGrowth),
    confidenceColor: growthColor(comparison.confidenceGrowth),
    screenColor: growthColor(comparison.screenGrowth),
  };
}
