/**
 * Phantom-branded metric value object.
 *
 * A `Metric<Kind>` is the atomic unit of pipeline observability. The phantom
 * `Kind` parameter is a string literal that identifies the metric's semantic
 * role (e.g. `'extraction-ratio'`). Two metrics with different kinds are
 * not assignable to each other at the type level, even when their runtime
 * shapes are identical.
 *
 * Metrics are produced by `MetricVisitor`s that fold over typed pipeline
 * receipts (resolution receipts, handshake records, execution receipts,
 * proposal ledger entries). The runtime never imports this module; metrics
 * are derived strictly downstream of pipeline execution.
 *
 * Composes into hierarchical trees via `metric-tree.ts`.
 */

import type { Brand } from '../kernel/brand';

// ─── Units ───

/** A controlled vocabulary of measurement units. New units must be added
 *  here so visitors and renderers can agree on interpretation. */
export type MetricUnit =
  | 'ratio'           // 0..1 fraction of a whole
  | 'percent'         // 0..100, presentation form of ratio
  | 'count'           // non-negative integer
  | 'rate-per-step'   // events per pipeline step
  | 'rate-per-run'    // events per scenario run
  | 'milliseconds'    // wall-clock latency
  | 'log2-entries'    // log-scale knowledge volume (matches MemoryMaturity)
  | 'dimensionless';  // pure number with no canonical unit

// ─── Provenance ───

/** Where a metric came from. Every metric carries enough provenance for an
 *  operator to trace it back to the receipts it was computed from. */
export interface MetricProvenance {
  /** Stable identifier of the visitor that produced this metric. */
  readonly visitorId: string;
  /** Kinds of receipts the visitor consumed (e.g. `['resolution-receipt']`). */
  readonly receiptKinds: readonly string[];
  /** Number of receipts consumed for this metric. Distinguishes a metric
   *  computed from one step versus a thousand steps. */
  readonly receiptCount: number;
  /** ISO timestamp the metric was computed at. */
  readonly computedAt: string;
  /** Optional commit SHA the receipts were produced under. */
  readonly pipelineVersion?: string | undefined;
}

// ─── Metric ───

/** Phantom brand for a metric kind. Combined with the discriminator field
 *  this prevents accidental cross-assignment between metric kinds even when
 *  shapes match structurally. */
export type Metric<Kind extends string> = Brand<{
  readonly kind: Kind;
  readonly value: number;
  readonly unit: MetricUnit;
  readonly provenance: MetricProvenance;
}, `metric:${Kind}`>;

/** Construct a metric. The phantom brand is enforced by this constructor —
 *  external callers cannot fabricate a `Metric<Kind>` without going through
 *  one of these constructors (or a downstream visitor). */
export function metric<Kind extends string>(input: {
  readonly kind: Kind;
  readonly value: number;
  readonly unit: MetricUnit;
  readonly provenance: MetricProvenance;
}): Metric<Kind> {
  return {
    kind: input.kind,
    value: input.value,
    unit: input.unit,
    provenance: input.provenance,
  } as Metric<Kind>;
}

/** Type-narrowing predicate for metrics of a specific kind. Useful when
 *  walking heterogeneous metric trees. */
export function isMetricOfKind<Kind extends string>(
  candidate: Metric<string>,
  kind: Kind,
): candidate is Metric<Kind> {
  return candidate.kind === kind;
}
