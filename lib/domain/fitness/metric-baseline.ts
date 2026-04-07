/**
 * Metric baseline — a captured snapshot of a metric tree at a specific
 * commit and pipeline version, persisted for future comparison.
 *
 * Baselines exist to serve the fifth-kind loop: an author edits pipeline
 * code, runs `score`, and the resulting metric tree is diffed against
 * the most recent baseline (or a named one). Baselines themselves are
 * immutable value objects — capturing a new baseline produces a new file,
 * never an in-place mutation.
 *
 * Persistence shape, file format, and naming convention are owned by the
 * application layer (`lib/application/measurement/baseline-store.ts`).
 * This module owns only the value object.
 */

import type { MetricNode } from './metric-tree';

// ─── Baseline ───

export interface MetricBaseline {
  readonly kind: 'metric-baseline';
  readonly version: 1;
  /** Operator-supplied label. Conventionally a release tag, commit short
   *  SHA, or a meaningful name like `'pre-cohort-rollout'`. */
  readonly label: string;
  /** ISO timestamp the baseline was captured at. */
  readonly capturedAt: string;
  /** Commit SHA the receipts were produced under. May be `null` for local
   *  uncommitted runs. */
  readonly commitSha: string | null;
  /** Pipeline version string (npm package version, build tag, etc.). */
  readonly pipelineVersion: string;
  /** Optional free-form notes from the operator. */
  readonly notes?: string | undefined;
  /** The captured metric tree. */
  readonly tree: MetricNode;
}

/** Construct a baseline. The shape is fixed and the constructor exists
 *  primarily so callers do not have to remember the `kind`/`version`
 *  literals. */
export function metricBaseline(input: {
  readonly label: string;
  readonly capturedAt: string;
  readonly commitSha: string | null;
  readonly pipelineVersion: string;
  readonly notes?: string | undefined;
  readonly tree: MetricNode;
}): MetricBaseline {
  return {
    kind: 'metric-baseline',
    version: 1,
    label: input.label,
    capturedAt: input.capturedAt,
    commitSha: input.commitSha,
    pipelineVersion: input.pipelineVersion,
    notes: input.notes,
    tree: input.tree,
  };
}
