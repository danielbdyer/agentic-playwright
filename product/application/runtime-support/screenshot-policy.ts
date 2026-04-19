/**
 * Screenshot Policy — pure policy for selective Playwright screenshot capture.
 *
 * At scale (1000 test cases × 5-15 steps × multiple iterations), capturing a
 * screenshot on every step is prohibitive. This module defines a pure policy
 * that decides WHEN a screenshot adds diagnostic value to the agent loop.
 *
 * Policy triggers (any match → capture):
 *   1. Step failure — always capture on failure for root-cause analysis
 *   2. Rung drift — step resolved via a lower rung than previous run (degradation)
 *   3. Agent interpretation — step required agent/needs-human intervention
 *   4. Hot screen — screen appears in the learning-state hot screen list
 *   5. Health dimension critical — execution health below critical threshold
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 * The policy produces a decision; the runtime captures (or skips) the screenshot.
 */

import type { LearningSignalsSummary } from '../../domain/improvement/types';

// ─── Policy Decision ───

export type ScreenshotReason =
  | 'step-failure'
  | 'rung-drift'
  | 'agent-interpretation'
  | 'hot-screen'
  | 'health-critical'
  | 'first-step'
  | 'none';

export interface ScreenshotDecision {
  readonly capture: boolean;
  readonly reason: ScreenshotReason;
  /** Relative priority for storage budget — higher values survive pruning first. */
  readonly priority: number;
}

const CAPTURE = (reason: ScreenshotReason, priority: number): ScreenshotDecision =>
  ({ capture: true, reason, priority });

const SKIP: ScreenshotDecision = { capture: false, reason: 'none', priority: 0 };

// ─── Step Context (inputs to the policy) ───

export interface StepScreenshotContext {
  /** Whether the step execution failed. */
  readonly failed: boolean;
  /** The resolution rung used for this step (e.g., 'approved-knowledge', 'live-exploration'). */
  readonly currentRung: string;
  /** The resolution rung from the previous run for the same step, if available. */
  readonly previousRung?: string | undefined;
  /** The provenance kind of the step's interpretation receipt. */
  readonly provenanceKind: string;
  /** The screen this step executed on. */
  readonly screenId: string;
  /** Whether this is the first step in the scenario. */
  readonly isFirstStep: boolean;
  /** The set of hot screen IDs from execution coherence analysis. */
  readonly hotScreenIds: ReadonlySet<string>;
  /** Current learning signals summary, if available. */
  readonly learningSignals?: LearningSignalsSummary | undefined;
  /** Current signal maturity (0-1). */
  readonly maturity?: number | undefined;
}

// ─── Rung Ordering (lower index = higher/better rung) ───

const RUNG_ORDER: readonly string[] = [
  'explicit-scenario',
  'control-resolution',
  'approved-knowledge',
  'screen-hint',
  'shared-pattern',
  'prior-evidence',
  'live-exploration',
  'needs-human',
];

function rungIndex(rung: string): number {
  const idx = RUNG_ORDER.indexOf(rung);
  return idx === -1 ? RUNG_ORDER.length : idx;
}

/** Detect rung drift: current rung is lower (worse) than previous rung. */
function hasRungDrift(current: string, previous: string | undefined): boolean {
  if (!previous) return false;
  return rungIndex(current) > rungIndex(previous);
}

// ─── Core Policy ───

/**
 * Evaluate the screenshot policy for a single step.
 *
 * Returns a decision indicating whether to capture and why.
 * When multiple triggers match, the highest-priority reason wins.
 *
 * Pure function: step context → decision.
 */
export function evaluateScreenshotPolicy(ctx: StepScreenshotContext): ScreenshotDecision {
  // Highest priority: step failure — always capture
  if (ctx.failed) {
    return CAPTURE('step-failure', 1.0);
  }

  // Agent interpretation (needs-human or agent-interpreted provenance)
  if (ctx.provenanceKind === 'unresolved' || ctx.provenanceKind === 'agent-interpreted') {
    return CAPTURE('agent-interpretation', 0.9);
  }

  // Rung drift — resolution quality degraded from previous run
  if (hasRungDrift(ctx.currentRung, ctx.previousRung)) {
    return CAPTURE('rung-drift', 0.8);
  }

  // Hot screen — this screen has been flagged by execution coherence
  if (ctx.hotScreenIds.has(ctx.screenId)) {
    return CAPTURE('hot-screen', 0.7);
  }

  // Health-critical: composite health is below 0.3 and maturity is high enough to trust
  if (
    ctx.learningSignals &&
    ctx.maturity !== undefined &&
    ctx.maturity > 0.4 &&
    ctx.learningSignals.compositeHealthScore < 0.3
  ) {
    return CAPTURE('health-critical', 0.6);
  }

  // First step of a scenario — useful for baseline but lowest priority
  if (ctx.isFirstStep) {
    return CAPTURE('first-step', 0.2);
  }

  return SKIP;
}

// ─── Manifest Entry ───

export interface ScreenshotManifestEntry {
  readonly stepKey: string;
  readonly screenId: string;
  readonly reason: ScreenshotReason;
  readonly priority: number;
  readonly capturedAt: string;
  readonly filePath: string;
}

export interface ScreenshotManifest {
  readonly kind: 'screenshot-manifest';
  readonly version: 1;
  readonly entries: readonly ScreenshotManifestEntry[];
}

/**
 * Prune a manifest to stay within a storage budget.
 * Keeps the highest-priority entries up to maxEntries.
 * Pure function: manifest + budget → pruned manifest.
 */
export function pruneManifest(
  manifest: ScreenshotManifest,
  maxEntries: number,
): ScreenshotManifest {
  if (manifest.entries.length <= maxEntries) return manifest;
  const sorted = [...manifest.entries].sort((a, b) => b.priority - a.priority);
  return {
    ...manifest,
    entries: sorted.slice(0, maxEntries),
  };
}

/**
 * Estimate the capture rate for a set of step contexts.
 * Useful for budget planning and observability.
 * Pure function: contexts → ratio in [0, 1].
 */
export function estimateCaptureRate(contexts: readonly StepScreenshotContext[]): number {
  if (contexts.length === 0) return 0;
  const captured = contexts.filter((ctx) => evaluateScreenshotPolicy(ctx).capture).length;
  return captured / contexts.length;
}
