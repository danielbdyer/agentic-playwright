/**
 * Handshake-density visitor.
 *
 * Pure projection from PipelineFitnessMetrics. Reports the fraction of
 * pipeline steps that required some form of handshake — suspension,
 * agent fallback, or live-DOM exploration. A lower value means the
 * deterministic compiler resolved more steps without escalation.
 *
 * Polarity: lower is better.
 */

import type { PipelineFitnessMetrics } from '../../../../product/domain/fitness/types';
import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'l4:handshake-density';

function provenance(metrics: PipelineFitnessMetrics, computedAt: string): MetricProvenance {
  return {
    visitorId: VISITOR_ID,
    receiptKinds: ['pipeline-fitness-metrics'],
    receiptCount: metrics.resolutionByRung.reduce((acc, rung) => acc + rung.wins, 0),
    computedAt,
  };
}

export interface HandshakeDensityInput {
  readonly metrics: PipelineFitnessMetrics;
  readonly computedAt: string;
}

export const handshakeDensityVisitor: MetricVisitor<HandshakeDensityInput, 'handshake-density'> = {
  id: VISITOR_ID,
  outputKind: 'handshake-density',
  inputDescription: '{ metrics: PipelineFitnessMetrics, computedAt: string }',
  visit: (input) => {
    const prov = provenance(input.metrics, input.computedAt);

    const suspensionRate = input.metrics.suspensionRate ?? 0;
    const agentFallbackRate = input.metrics.agentFallbackRate ?? 0;
    const liveDomFallbackRate = input.metrics.liveDomFallbackRate ?? 0;

    // Aggregate handshake density: any non-deterministic resolution
    // path counts. Capped at 1 — the components are not strictly
    // disjoint but pipeline accounting clamps them in practice.
    const aggregate = Math.min(
      1,
      suspensionRate + agentFallbackRate + liveDomFallbackRate,
    );

    const root = metric({
      kind: 'handshake-density',
      value: aggregate,
      unit: 'rate-per-step',
      provenance: prov,
    });

    const children = [
      metricNode(
        metric({
          kind: 'suspension-rate',
          value: suspensionRate,
          unit: 'rate-per-step',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'agent-fallback-rate',
          value: agentFallbackRate,
          unit: 'rate-per-step',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'live-dom-fallback-rate',
          value: liveDomFallbackRate,
          unit: 'rate-per-step',
          provenance: prov,
        }),
      ),
    ];

    return metricNode(root, children);
  },
};
