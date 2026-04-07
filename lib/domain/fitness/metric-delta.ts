/**
 * Typed difference between two metric trees.
 *
 * A `MetricTreeDelta` is the gradient signal the fifth-kind loop hands to
 * its author. It pairs a baseline tree with a fresh tree, walks both in
 * lockstep, and emits one `MetricDelta` per metric kind that appears in
 * either tree. The polarity registry determines whether a numeric change
 * counts as `'better'`, `'worse'`, `'unchanged'`, or `'incomparable'`.
 *
 * Delta computation is pure: same inputs always produce the same output.
 * Renderers and CLI report writers consume `MetricTreeDelta` directly and
 * do not re-interpret raw metric values.
 */

import type { Metric } from './metric';
import type { MetricNode } from './metric-tree';
import { flattenMetricTree } from './metric-tree';
import { metricPolarity, type MetricPolarity } from './metric-catalogue';

// ─── Delta direction ───

export type MetricDeltaDirection =
  | 'better'        // change moved in the polarity-favored direction
  | 'worse'         // change moved against the polarity-favored direction
  | 'unchanged'     // numerical difference within EPSILON
  | 'incomparable'  // metric present on only one side, or units differ
  | 'neutral';      // change present but polarity is neutral

const EPSILON = 1e-9;

// ─── Per-metric delta ───

export interface MetricDelta {
  readonly kind: string;
  readonly polarity: MetricPolarity;
  /** Value from the baseline tree, or `null` if absent. */
  readonly before: number | null;
  /** Value from the fresh tree, or `null` if absent. */
  readonly after: number | null;
  /** `after - before` when both sides are present. */
  readonly absolute: number | null;
  /** `(after - before) / before` when both sides are present and `before`
   *  is non-zero. */
  readonly relative: number | null;
  readonly direction: MetricDeltaDirection;
}

// ─── Tree-wide delta ───

export interface MetricTreeDelta {
  readonly kind: 'metric-tree-delta';
  readonly version: 1;
  readonly baselineLabel: string;
  readonly comparedAt: string;
  readonly entries: ReadonlyArray<MetricDelta>;
}

// ─── Diff implementation ───

function classifyDirection(
  polarity: MetricPolarity,
  before: number | null,
  after: number | null,
): MetricDeltaDirection {
  if (before === null || after === null) return 'incomparable';
  const diff = after - before;
  if (Math.abs(diff) < EPSILON) return 'unchanged';
  if (polarity === 'neutral') return 'neutral';
  const movedUp = diff > 0;
  const upIsBetter = polarity === 'higher-is-better';
  return movedUp === upIsBetter ? 'better' : 'worse';
}

function indexByKind(tree: MetricNode): ReadonlyMap<string, Metric<string>> {
  const flat = flattenMetricTree(tree);
  const map = new Map<string, Metric<string>>();
  for (const metric of flat) {
    // First occurrence wins — sub-metrics with duplicate kinds within a
    // single tree are ambiguous and should be avoided by visitors.
    if (!map.has(metric.kind)) {
      map.set(metric.kind, metric);
    }
  }
  return map;
}

/** Diff two metric trees, producing one entry per metric kind that appears
 *  in either side. The result's `entries` are sorted by metric kind for
 *  deterministic ordering across runs. */
export function diffMetricTrees(input: {
  readonly baselineLabel: string;
  readonly comparedAt: string;
  readonly before: MetricNode;
  readonly after: MetricNode;
}): MetricTreeDelta {
  const beforeIndex = indexByKind(input.before);
  const afterIndex = indexByKind(input.after);
  const allKinds = new Set<string>([...beforeIndex.keys(), ...afterIndex.keys()]);
  const sortedKinds = [...allKinds].sort();

  const entries: MetricDelta[] = sortedKinds.map((kind) => {
    const beforeMetric = beforeIndex.get(kind);
    const afterMetric = afterIndex.get(kind);
    const before = beforeMetric?.value ?? null;
    const after = afterMetric?.value ?? null;
    const polarity = metricPolarity(kind);
    const absolute =
      before !== null && after !== null ? after - before : null;
    const relative =
      before !== null && after !== null && Math.abs(before) > EPSILON
        ? (after - before) / before
        : null;
    return {
      kind,
      polarity,
      before,
      after,
      absolute,
      relative,
      direction: classifyDirection(polarity, before, after),
    };
  });

  return {
    kind: 'metric-tree-delta',
    version: 1,
    baselineLabel: input.baselineLabel,
    comparedAt: input.comparedAt,
    entries,
  };
}

// ─── Aggregate verdict ───

export type DeltaVerdict = 'improvement' | 'regression' | 'mixed' | 'unchanged';

/** Roll up a tree delta into a single verdict. The rules are deliberately
 *  simple: any `'worse'` entry pulls the verdict toward regression; any
 *  `'better'` entry pulls toward improvement; both present means `'mixed'`.
 *  `'unchanged'`, `'neutral'`, and `'incomparable'` entries do not move
 *  the verdict. */
export function deltaVerdict(delta: MetricTreeDelta): DeltaVerdict {
  let hasBetter = false;
  let hasWorse = false;
  for (const entry of delta.entries) {
    if (entry.direction === 'better') hasBetter = true;
    if (entry.direction === 'worse') hasWorse = true;
  }
  if (hasBetter && hasWorse) return 'mixed';
  if (hasBetter) return 'improvement';
  if (hasWorse) return 'regression';
  return 'unchanged';
}
