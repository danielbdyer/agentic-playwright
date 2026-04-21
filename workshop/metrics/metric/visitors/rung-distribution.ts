/**
 * Rung-distribution visitor.
 *
 * Pure projection from PipelineFitnessMetrics. Reports how steps are
 * distributed across the resolution precedence ladder. Each rung
 * becomes a child node carrying that rung's win-rate.
 *
 * Polarity: neutral at the root (the distribution itself has no
 * directional preference), but individual rungs are ordered: higher
 * rungs (closer to deterministic resolution) winning is "better" by
 * convention. The L4 catalogue treats this metric as composite —
 * authors read the children, not the root value.
 */

import type { PipelineFitnessMetrics } from '../../../../product/domain/fitness/types';
import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'l4:rung-distribution';

function provenance(metrics: PipelineFitnessMetrics, computedAt: string): MetricProvenance {
  return {
    visitorId: VISITOR_ID,
    receiptKinds: ['pipeline-fitness-metrics'],
    receiptCount: metrics.resolutionByRung.reduce((acc, rung) => acc + rung.wins, 0),
    computedAt,
  };
}

export interface RungDistributionInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
}

export const rungDistributionVisitor: MetricVisitor<RungDistributionInput, 'rung-distribution'> = {
  id: VISITOR_ID,
  outputKind: 'rung-distribution',
  inputDescription: '{ metrics: PipelineFitnessMetrics, computedAt: string }',
  visit: (input) => {
    const prov = provenance(input.metrics, input.computedAt);
    const totalWins = input.metrics.resolutionByRung.reduce((acc, rung) => acc + rung.wins, 0);

    // Root carries total win count for tree-wide diff visibility.
    const root = metric({
      kind: 'rung-distribution',
      value: totalWins,
      unit: 'count',
      provenance: prov,
    });

    // One child per rung, named `rung-{rungName}-share`. The share is
    // the rate field directly (already normalized). Sorted by rung
    // name for deterministic ordering across runs.
    const children = [...input.metrics.resolutionByRung]
      .sort((a, b) => a.rung.localeCompare(b.rung))
      .map((rung) =>
        metricNode(
          metric({
            kind: `rung-${rung.rung}-share`,
            value: rung.rate,
            unit: 'ratio',
            provenance: prov,
          }),
        ),
      );

    return metricNode(root, children);
  },
};
