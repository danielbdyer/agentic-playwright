/**
 * pipeline visitor registry and aggregate tree builder.
 *
 * Wires the 5 pipeline visitors into a compile-time-exhaustive registry over
 * `PipelineMetricKind`. Adding a new metric kind to `PIPELINE_METRIC_KINDS`
 * without registering its visitor here is a TypeScript error.
 *
 * `buildPipelineMetricTree` is the canonical entry point: pass it a
 * PipelineFitnessMetrics and a timestamp, get back a single MetricNode
 * with one child per pipeline metric kind. The returned tree is the input
 * to baseline capture, delta diffing, and rendering.
 */

import type { PipelineFitnessMetrics } from '../../types';
import type { MemoryMaturityTrajectory } from '../../memory-maturity-trajectory';
import { EMPTY_TRAJECTORY } from '../../memory-maturity-trajectory';
import { metric, type MetricProvenance } from '../value';
import { metricNode, type MetricNode } from '../tree';
import { PIPELINE_METRIC_KINDS, type PipelineMetricKind } from '../catalogue';
import type { MetricVisitor } from '../visitor';
import { extractionRatioVisitor } from './extraction-ratio';
import { handshakeDensityVisitor } from './handshake-density';
import { rungDistributionVisitor } from './rung-distribution';
import { interventionCostVisitor } from './intervention-cost';
import { compoundingEconomicsVisitor } from './compounding-economics';
import { memoryWorthinessRatioVisitor } from './memory-worthiness-ratio';

// ─── Per-visitor input shape ────────────────────────────────────

/** All pipeline visitors share this input shape. The trajectory field was
 *  added for the M5 (memory-worthiness-ratio) visitor; other visitors
 *  ignore it. */
export interface PipelineVisitorInput {
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
 *  `Record<PipelineMetricKind, ...>` forces every catalogue entry to have a
 *  visitor — adding a new kind without an entry is a type error here. */
export const PIPELINE_VISITORS: {
  readonly [K in PipelineMetricKind]: MetricVisitor<PipelineVisitorInput, K>;
} = {
  'extraction-ratio': extractionRatioVisitor,
  'handshake-density': handshakeDensityVisitor,
  'rung-distribution': rungDistributionVisitor,
  'intervention-cost': interventionCostVisitor,
  'compounding-economics': compoundingEconomicsVisitor,
  'memory-worthiness-ratio': memoryWorthinessRatioVisitor,
};

// ─── Tree builder ────────────────────────────────────────────────

/** Aggregate pipeline metric tree. The root is a synthetic 'pipeline-root' metric
 *  whose value is the count of pipeline metric kinds present. Children are
 *  one node per pipeline visitor, in `PIPELINE_METRIC_KINDS` declaration order
 *  (deterministic across runs).
 *
 *  Renderers should walk the children, not the root — the root exists
 *  only so the tree has a single entry point and a stable identity for
 *  baseline diffing. */
export function buildPipelineMetricTree(input: PipelineVisitorInput): MetricNode {
  const provenance: MetricProvenance = {
    visitorId: 'pipeline:root',
    receiptKinds: ['pipeline-fitness-metrics'],
    receiptCount: PIPELINE_METRIC_KINDS.length,
    computedAt: input.computedAt,
  };

  const children: ReadonlyArray<MetricNode> = PIPELINE_METRIC_KINDS.map((kind) => {
    const visitor = PIPELINE_VISITORS[kind];
    return visitor.visit(input);
  });

  const root = metric({
    kind: 'pipeline-root',
    value: PIPELINE_METRIC_KINDS.length,
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
