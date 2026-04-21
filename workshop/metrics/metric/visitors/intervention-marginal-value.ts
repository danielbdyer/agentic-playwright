/**
 * Intervention Marginal Value (C6) visitor — stub pending Step 10.
 *
 * Concept (v2): the workshop's graduation gate. A positive C6 means
 * "accepting a hypothesis pays off"; a floor-crossing sustained C6
 * is part of the condition under which the workshop puts itself
 * out of a job.
 *
 * v1 → v2 reshape per `docs/v2-substrate.md §8a`:
 *   - v1 C6 read from `InterventionTokenImpact` records in the
 *     improvement ledger; that denominator retires.
 *   - v2 successor is `metric-hypothesis-confirmation-rate` —
 *     the fraction of ProbeReceipts whose `hypothesisId` is
 *     non-null and `outcome.completedAsExpected === true` across
 *     a rolling window.
 *   - Lands as a manifest-declared metric verb at Step 10 (L4
 *     self-refinement) per `docs/v2-direction.md §6`.
 *
 * This stub preserves the visitor's slot in the metric tree and
 * the registry's compile-time exhaustiveness — adding a metric kind
 * without its visitor is a typecheck error. The value is 0 until
 * Step 10 rewires it to read the receipt log.
 *
 * Polarity: higher is better.
 *
 * @see docs/v2-substrate.md §8a (C6 reshape)
 * @see docs/v2-direction.md §6 Step 10 (wire-up)
 * @see docs/v1-reference/alignment-targets.md § C6 (legacy definition)
 */

import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'pipeline:intervention-marginal-value';

/** Stub input — structurally compatible with PipelineVisitorInput.
 *  The Step-10 visitor will read ProbeReceipts with non-null
 *  hypothesisId from an additional field on PipelineVisitorInput. */
interface C6Input {
  readonly computedAt: string;
}

export const interventionMarginalValueVisitor: MetricVisitor<
  C6Input,
  'intervention-marginal-value'
> = {
  id: VISITOR_ID,
  outputKind: 'intervention-marginal-value',
  inputDescription: '{ computedAt } (stub — real data wired in Phase C)',
  visit: (input) => {
    const prov: MetricProvenance = {
      visitorId: VISITOR_ID,
      // Step 10 swaps this to ['probe-receipt'] when the visitor
      // reads hypothesis-tagged receipts. Today's stub declares
      // the legacy receipt kind so v1-era baselines diff cleanly
      // — the value is 0 regardless of which kind is declared.
      receiptKinds: ['intervention-token-impact'],
      receiptCount: 0,
      computedAt: input.computedAt,
    };

    const root = metric({
      kind: 'intervention-marginal-value',
      value: 0,
      unit: 'ratio',
      provenance: prov,
    });

    return metricNode(root, []);
  },
};
