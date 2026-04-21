/**
 * Compounding-economics visitor.
 *
 * Pure projection from PipelineFitnessMetrics. Reports whether the
 * substrate is earning leverage over time. Uses the
 * compounding-economics proof obligation when present, exposing the
 * memory maturity, proposal yield, and convergence velocity as
 * sub-metrics.
 *
 * Polarity: higher is better.
 */

import type { PipelineFitnessMetrics, LogicalProofObligation } from '../../../../product/domain/fitness/types';
import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'l4:compounding-economics';

function findObligation(
  metrics: PipelineFitnessMetrics,
  name: LogicalProofObligation['obligation'],
): LogicalProofObligation | undefined {
  return metrics.proofObligations?.find((o) => o.obligation === name);
}

function provenance(metrics: PipelineFitnessMetrics, computedAt: string): MetricProvenance {
  return {
    visitorId: VISITOR_ID,
    receiptKinds: ['pipeline-fitness-metrics', 'proof-obligations'],
    receiptCount: metrics.proofObligations?.length ?? 0,
    computedAt,
  };
}

export interface CompoundingEconomicsInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
}

export const compoundingEconomicsVisitor: MetricVisitor<
  CompoundingEconomicsInput,
  'compounding-economics'
> = {
  id: VISITOR_ID,
  outputKind: 'compounding-economics',
  inputDescription: '{ metrics: PipelineFitnessMetrics, computedAt: string }',
  visit: (input) => {
    const prov = provenance(input.metrics, input.computedAt);

    const obligation = findObligation(input.metrics, 'compounding-economics');

    // Primary signal: obligation score (0..1). Fall back to proposal
    // yield as a weak proxy when the obligation is missing.
    const aggregate = obligation?.score ?? input.metrics.proposalYield;

    const root = metric({
      kind: 'compounding-economics',
      value: aggregate,
      unit: 'ratio',
      provenance: prov,
    });

    const children = [
      ...(input.metrics.memoryMaturity !== undefined
        ? [
            metricNode(
              metric({
                kind: 'memory-maturity',
                value: input.metrics.memoryMaturity,
                unit: 'log2-entries',
                provenance: prov,
              }),
            ),
          ]
        : []),
      ...(input.metrics.memoryMaturityEntries !== undefined
        ? [
            metricNode(
              metric({
                kind: 'memory-maturity-entries',
                value: input.metrics.memoryMaturityEntries,
                unit: 'count',
                provenance: prov,
              }),
            ),
          ]
        : []),
      metricNode(
        metric({
          kind: 'proposal-yield',
          value: input.metrics.proposalYield,
          unit: 'ratio',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'convergence-velocity',
          value: input.metrics.convergenceVelocity,
          unit: 'count',
          provenance: prov,
        }),
      ),
    ];

    return metricNode(root, children);
  },
};
