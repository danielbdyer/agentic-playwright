/**
 * Intervention Marginal Value (C6) visitor — stub.
 *
 * Implements C6 from `docs/alignment-targets.md`:
 *
 *   C6 = % of accepted augmentations that reduce ambiguity,
 *         suspension, or rung-score in their attachment region
 *         within N runs.
 *
 * This is a STUB — it returns a zero-value proxy metric. Phase C
 * item 4 wires it to real data from populated
 * InterventionTokenImpact records in the improvement ledger.
 * Until then, C6 is marked as a proxy in the scoreboard.
 *
 * Polarity: higher is better. A positive C6 means "interventions
 * are earning their maintenance cost."
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 5
 * @see docs/alignment-targets.md § C6
 */

import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';

const VISITOR_ID = 'pipeline:intervention-marginal-value';

/** Stub input — structurally compatible with PipelineVisitorInput.
 *  The real visitor (Phase C) will read InterventionTokenImpact
 *  records from an additional field added to PipelineVisitorInput. */
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
      receiptKinds: ['intervention-token-impact'],
      receiptCount: 0, // stub — no real data
      computedAt: input.computedAt,
    };

    const root = metric({
      kind: 'intervention-marginal-value',
      value: 0, // proxy — Phase C populates
      unit: 'ratio',
      provenance: prov,
    });

    return metricNode(root, []);
  },
};
