/**
 * L4 visitor registry and aggregate tree builder.
 *
 * Wires the 5 L4 visitors into a compile-time-exhaustive registry over
 * `L4MetricKind`. Adding a new metric kind to `L4_METRIC_KINDS`
 * without registering its visitor here is a TypeScript error.
 *
 * `buildL4MetricTree` is the canonical entry point: pass it a
 * PipelineFitnessMetrics and a timestamp, get back a single MetricNode
 * with one child per L4 metric kind. The returned tree is the input
 * to baseline capture, delta diffing, and rendering.
 */

import type { PipelineFitnessMetrics } from '../../types';
import type { MemoryMaturityTrajectory } from '../../memory-maturity-trajectory';
import { EMPTY_TRAJECTORY } from '../../memory-maturity-trajectory';
import { metric, type MetricProvenance } from '../value';
import { metricNode, type MetricNode } from '../tree';
import { L4_METRIC_KINDS, type L4MetricKind } from '../catalogue';
import type { MetricVisitor } from '../visitor';
import { extractionRatioVisitor } from './extraction-ratio';
import { handshakeDensityVisitor } from './handshake-density';
import { rungDistributionVisitor } from './rung-distribution';
import { interventionCostVisitor } from './intervention-cost';
import { compoundingEconomicsVisitor } from './compounding-economics';
import { memoryWorthinessRatioVisitor } from './memory-worthiness-ratio';

// ─── Per-visitor input shape ────────────────────────────────────

/** All L4 visitors share this input shape. The trajectory field was
 *  added for the M5 (memory-worthiness-ratio) visitor; other visitors
 *  ignore it. */
export interface L4VisitorInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
  /** The memory-maturity trajectory for the M5 visitor. Other
   *  visitors ignore this field. Defaults to EMPTY_TRAJECTORY if
   *  not provided at the call site. */
  readonly trajectory?: MemoryMaturityTrajectory | undefined;
  /** Per-iteration scorecard overhead for the M5 denominator. */
  readonly maintenanceOverhead?: number | undefined;
}

// ─── Registry ────────────────────────────────────────────────────

/** Compile-time-exhaustive registry. The mapped type
 *  `Record<L4MetricKind, ...>` forces every catalogue entry to have a
 *  visitor — adding a new kind without an entry is a type error here. */
export const L4_VISITORS: {
  readonly [K in L4MetricKind]: MetricVisitor<L4VisitorInput, K>;
} = {
  'extraction-ratio': extractionRatioVisitor,
  'handshake-density': handshakeDensityVisitor,
  'rung-distribution': rungDistributionVisitor,
  'intervention-cost': interventionCostVisitor,
  'compounding-economics': compoundingEconomicsVisitor,
  'memory-worthiness-ratio': memoryWorthinessRatioVisitor,
};

// ─── Tree builder ────────────────────────────────────────────────

/** Aggregate L4 metric tree. The root is a synthetic 'l4-root' metric
 *  whose value is the count of L4 metric kinds present. Children are
 *  one node per L4 visitor, in `L4_METRIC_KINDS` declaration order
 *  (deterministic across runs).
 *
 *  Renderers should walk the children, not the root — the root exists
 *  only so the tree has a single entry point and a stable identity for
 *  baseline diffing. */
export function buildL4MetricTree(input: L4VisitorInput): MetricNode {
  const provenance: MetricProvenance = {
    visitorId: 'l4:root',
    receiptKinds: ['pipeline-fitness-metrics'],
    receiptCount: L4_METRIC_KINDS.length,
    computedAt: input.computedAt,
  };

  const children: ReadonlyArray<MetricNode> = L4_METRIC_KINDS.map((kind) => {
    const visitor = L4_VISITORS[kind];
    return visitor.visit(input);
  });

  const root = metric({
    kind: 'l4-root',
    value: L4_METRIC_KINDS.length,
    unit: 'count',
    provenance,
  });

  return metricNode(root, children);
}

// ─── Re-exports ──────────────────────────────────────────────────

export { extractionRatioVisitor } from './extraction-ratio';
export { handshakeDensityVisitor } from './handshake-density';
export { rungDistributionVisitor } from './rung-distribution';
export { interventionCostVisitor } from './intervention-cost';
export { compoundingEconomicsVisitor } from './compounding-economics';
export type { ExtractionRatioInput } from './extraction-ratio';
export type { HandshakeDensityInput } from './handshake-density';
export type { RungDistributionInput } from './rung-distribution';
export type { InterventionCostInput } from './intervention-cost';
export type { CompoundingEconomicsInput } from './compounding-economics';
