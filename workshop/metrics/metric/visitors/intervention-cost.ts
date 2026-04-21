/**
 * Intervention-cost visitor.
 *
 * Pure projection from PipelineFitnessMetrics. Aggregates the operator
 * cost surface — how much human or agent intervention the pipeline
 * required per scenario. Uses the operator-intervention-density
 * obligation when present, falling back to a derived combination of
 * suspension and agent-fallback rates.
 *
 * Polarity: lower is better.
 */

import type { PipelineFitnessMetrics, LogicalProofObligation } from '../../../../product/domain/fitness/types';
import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'l4:intervention-cost';

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

export interface InterventionCostInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
}

export const interventionCostVisitor: MetricVisitor<InterventionCostInput, 'intervention-cost'> = {
  id: VISITOR_ID,
  outputKind: 'intervention-cost',
  inputDescription: '{ metrics: PipelineFitnessMetrics, computedAt: string }',
  visit: (input) => {
    const prov = provenance(input.metrics, input.computedAt);

    const operatorObligation = findObligation(input.metrics, 'operator-intervention-density');
    const handoffObligation = findObligation(input.metrics, 'handoff-integrity');

    // Primary signal: the operator-intervention-density obligation when
    // present (direct measurement). Falls back to a derived sum of
    // suspension + agent-fallback when the obligation is missing.
    const directIntervention = operatorObligation?.score;
    const derivedIntervention =
      (input.metrics.suspensionRate ?? 0) + (input.metrics.agentFallbackRate ?? 0);
    const aggregate = directIntervention ?? derivedIntervention;

    const root = metric({
      kind: 'intervention-cost',
      value: aggregate,
      unit: 'rate-per-run',
      provenance: prov,
    });

    const children = [
      metricNode(
        metric({
          kind: 'intervention-source',
          value: directIntervention !== undefined ? 1 : 0,
          unit: 'dimensionless',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'derived-intervention-floor',
          value: derivedIntervention,
          unit: 'rate-per-step',
          provenance: prov,
        }),
      ),
      ...(handoffObligation !== undefined
        ? [
            metricNode(
              metric({
                kind: 'handoff-integrity',
                value: handoffObligation.score,
                unit: 'ratio',
                provenance: prov,
              }),
            ),
          ]
        : []),
    ];

    return metricNode(root, children);
  },
};
