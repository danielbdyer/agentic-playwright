/**
 * Memory Worthiness Ratio (M5) visitor.
 *
 * Implements M5 from `docs/alignment-targets.md`:
 *
 *   M5 = RememberingBenefit(τ) / MemoryMaintenanceCost(τ)
 *
 * Operationalized as the slope of effectiveHitRate over
 * MemoryMaturity in the cohort-indexed trajectory, divided by
 * per-iteration scorecard maintenance overhead.
 *
 * When the trajectory has fewer than 3 comparable cohort points,
 * M5 returns 0 (not enough data to compute a slope). The
 * `trajectorySlope` function handles the <2 case; we add the
 * 3-point gate per the convergence plan's exit criteria.
 *
 * Polarity: higher is better. A positive M5 means "remembering
 * is paying off — more memory leads to better hit rates."
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 4
 * @see docs/alignment-targets.md § M5
 */

import { metric, type MetricProvenance } from '../value';
import { metricNode } from '../tree';
import type { MetricVisitor } from '../visitor';
import { EMPTY_TRAJECTORY } from '../../memory-maturity-trajectory';
import {
  trajectorySlope,
  latestMaturity,
  latestHitRate,
} from '../../memory-maturity-trajectory';

const VISITOR_ID = 'l4:memory-worthiness-ratio';

/** Minimum number of trajectory points required for M5 to be
 *  directly computed (not a proxy zero). */
const MIN_TRAJECTORY_POINTS = 3;

/** The visitor's input shape mirrors PipelineVisitorInput but is
 *  declared locally to avoid a circular import (index.ts imports
 *  this file, so this file cannot import from index.ts).
 *  PipelineVisitorInput is a structural supertype of this shape —
 *  TypeScript's structural typing ensures compatibility at the
 *  registry boundary. */
interface M5Input {
  readonly trajectory?: import('../../memory-maturity-trajectory').MemoryMaturityTrajectory | undefined;
  readonly maintenanceOverhead?: number | undefined;
  readonly computedAt: string;
}

export const memoryWorthinessRatioVisitor: MetricVisitor<
  M5Input,
  'memory-worthiness-ratio'
> = {
  id: VISITOR_ID,
  outputKind: 'memory-worthiness-ratio',
  inputDescription: '{ metrics, trajectory?, maintenanceOverhead?, computedAt }',
  visit: (input) => {
    const trajectory = input.trajectory ?? EMPTY_TRAJECTORY;
    const prov: MetricProvenance = {
      visitorId: VISITOR_ID,
      receiptKinds: ['memory-maturity-trajectory'],
      receiptCount: trajectory.points.length,
      computedAt: input.computedAt,
    };

    const pointCount = trajectory.points.length;
    const hasEnoughData = pointCount >= MIN_TRAJECTORY_POINTS;
    const slope = hasEnoughData ? trajectorySlope(trajectory) : 0;
    const overhead = (input.maintenanceOverhead as number | undefined) ?? 0;
    const m5 = overhead > 0 ? slope / overhead : slope;

    const root = metric({
      kind: 'memory-worthiness-ratio',
      value: Number(m5.toFixed(4)),
      unit: 'ratio',
      provenance: prov,
    });

    const children = [
      metricNode(
        metric({
          kind: 'trajectory-slope',
          value: Number(slope.toFixed(6)),
          unit: 'dimensionless',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'trajectory-point-count',
          value: pointCount,
          unit: 'count',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'latest-maturity',
          value: latestMaturity(trajectory) as number,
          unit: 'log2-entries',
          provenance: prov,
        }),
      ),
      metricNode(
        metric({
          kind: 'latest-hit-rate',
          value: latestHitRate(trajectory),
          unit: 'ratio',
          provenance: prov,
        }),
      ),
    ];

    return metricNode(root, children);
  },
};
