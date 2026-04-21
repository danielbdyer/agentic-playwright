/**
 * Extraction-ratio visitor.
 *
 * Pure projection from PipelineFitnessMetrics into a MetricNode tree.
 *
 * Definition: the fraction of pipeline steps that resolved through
 * deterministic knowledge (knowledgeHitRate). When effectiveHitRate is
 * available it shadows the knowledge-only number with the broader
 * post-recovery hit rate as a child node.
 *
 * Polarity: higher is better.
 */

import type { PipelineFitnessMetrics } from '../../../../product/domain/fitness/types';
import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'l4:extraction-ratio';

function provenance(metrics: PipelineFitnessMetrics, computedAt: string): MetricProvenance {
  return {
    visitorId: VISITOR_ID,
    receiptKinds: ['pipeline-fitness-metrics'],
    receiptCount: metrics.resolutionByRung.reduce((acc, rung) => acc + rung.wins, 0),
    computedAt,
  };
}

export interface ExtractionRatioInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
}

export const extractionRatioVisitor: MetricVisitor<ExtractionRatioInput, 'extraction-ratio'> = {
  id: VISITOR_ID,
  outputKind: 'extraction-ratio',
  inputDescription: '{ metrics: PipelineFitnessMetrics, computedAt: string }',
  visit: (input) => {
    const prov = provenance(input.metrics, input.computedAt);
    const root = metric({
      kind: 'extraction-ratio',
      value: input.metrics.knowledgeHitRate,
      unit: 'ratio',
      provenance: prov,
    });

    const children = [
      ...(input.metrics.effectiveHitRate !== undefined
        ? [
            metricNode(
              metric({
                kind: 'effective-hit-rate',
                value: input.metrics.effectiveHitRate,
                unit: 'ratio',
                provenance: prov,
              }),
            ),
          ]
        : []),
      metricNode(
        metric({
          kind: 'translation-precision',
          value: input.metrics.translationPrecision,
          unit: 'ratio',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'translation-recall',
          value: input.metrics.translationRecall,
          unit: 'ratio',
          provenance: prov,
        }),
      ),
    ];

    return metricNode(root, children);
  },
};
